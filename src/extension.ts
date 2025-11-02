import * as vscode from 'vscode';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const execAsync = promisify(exec);
let outputChannel: vscode.OutputChannel;

// Helper function to strip ANSI color codes
function stripAnsiCodes(text: string): string {
    // eslint-disable-next-line no-control-regex
    return text.replace(/\x1b\[[0-9;]*m/g, '');
}

// Helper function to find SSH auth socket
function findSshAuthSocket(): string | undefined {
    // Check if user has manually configured SSH socket in settings
    const config = vscode.workspace.getConfiguration('gitcd');
    const configuredSocket = config.get<string>('sshAuthSock', '');
    if (configuredSocket && fs.existsSync(configuredSocket)) {
        return configuredSocket;
    }

    // Try environment variable
    if (process.env.SSH_AUTH_SOCK && fs.existsSync(process.env.SSH_AUTH_SOCK)) {
        return process.env.SSH_AUTH_SOCK;
    }

    // Try common locations for SSH agent sockets
    // IMPORTANT: GPG agent is checked first as it's more likely to have YubiKey/hardware keys
    const uid = os.userInfo().uid;
    const possiblePaths = [
        `/run/user/${uid}/gnupg/S.gpg-agent.ssh`,  // GPG agent (preferred - supports hardware keys)
        `${os.homedir()}/.gnupg/S.gpg-agent.ssh`,
        `/run/user/${uid}/keyring/.ssh`,           // GNOME Keyring hidden socket
        `/run/user/${uid}/keyring/ssh`,            // GNOME Keyring SSH agent
        `/tmp/ssh-*/agent.*`
    ];

    for (const socketPath of possiblePaths) {
        if (socketPath.includes('*')) {
            // Skip glob patterns for now - would need to implement glob matching
            continue;
        }
        if (fs.existsSync(socketPath)) {
            return socketPath;
        }
    }

    return undefined;
}

export function activate(context: vscode.ExtensionContext) {
    // Create regular output channel (LogOutputChannel doesn't render ANSI colors properly)
    outputChannel = vscode.window.createOutputChannel('Git-CD');

    console.log('Git-CD extension is now active');

    // Check and setup Python environment on activation
    ensurePythonEnvironment(context).catch(err => {
        console.error('Failed to setup Python environment:', err);
    });

    // Register all git-cd commands
    const commands = [
        { id: 'gitcd.init', handler: () => runGitCdCommand(context, ['init']) },
        { id: 'gitcd.start', handler: () => runGitCdCommandWithInput(context, ['start'], 'Enter feature branch name') },
        { id: 'gitcd.refresh', handler: () => runGitCdCommand(context, ['refresh']) },
        { id: 'gitcd.test', handler: () => runGitCdCommand(context, ['test']) },
        { id: 'gitcd.review', handler: () => runGitCdCommand(context, ['review']) },
        { id: 'gitcd.status', handler: () => runGitCdCommand(context, ['status']) },
        { id: 'gitcd.finish', handler: () => runGitCdCommand(context, ['finish']) },
        { id: 'gitcd.compare', handler: () => runGitCdCommandWithInput(context, ['compare'], 'Enter branch or tag name to compare') },
        { id: 'gitcd.release', handler: () => runGitCdCommand(context, ['release']) },
        { id: 'gitcd.clean', handler: () => runGitCdCommand(context, ['clean']) },
        { id: 'gitcd.version', handler: () => runGitCdCommand(context, ['version']) },
        { id: 'gitcd.upgrade', handler: () => runGitCdCommand(context, ['upgrade']) }
    ];

    commands.forEach(cmd => {
        const disposable = vscode.commands.registerCommand(cmd.id, cmd.handler);
        context.subscriptions.push(disposable);
    });
}

export function deactivate() {
    if (outputChannel) {
        outputChannel.dispose();
    }
}

async function ensurePythonEnvironment(context: vscode.ExtensionContext): Promise<void> {
    const config = vscode.workspace.getConfiguration('gitcd');
    const useBundled = config.get<boolean>('useBundledPython', true);

    if (!useBundled) {
        return;
    }

    const venvPath = path.join(context.extensionPath, 'python-env');
    const pythonPath = path.join(venvPath, 'bin', 'python');
    const gitcdPath = path.join(venvPath, 'bin', 'git-cd');

    // Check if virtual environment exists and gitcd is installed
    if (fs.existsSync(pythonPath) && fs.existsSync(gitcdPath)) {
        outputChannel.appendLine('✓ Bundled Git-CD environment found');
        return;
    }

    // Setup needed
    outputChannel.appendLine('Setting up bundled Git-CD environment...');
    outputChannel.show(true);

    try {
        const setupScript = path.join(context.extensionPath, 'setup-python.sh');
        const { stdout, stderr } = await execAsync(`bash "${setupScript}"`, {
            cwd: context.extensionPath
        });

        if (stdout) {
            outputChannel.appendLine(stdout);
        }
        if (stderr) {
            outputChannel.appendLine(stderr);
        }

        vscode.window.showInformationMessage('Git-CD environment setup complete!');
    } catch (error: any) {
        outputChannel.appendLine(`Setup failed: ${error.message}`);
        vscode.window.showWarningMessage(
            'Failed to setup bundled Git-CD. You can disable "useBundledPython" in settings and configure paths manually.',
            'Open Settings'
        ).then(selection => {
            if (selection === 'Open Settings') {
                vscode.commands.executeCommand('workbench.action.openSettings', 'gitcd');
            }
        });
    }
}

function getPythonAndGitcdPaths(context: vscode.ExtensionContext): { pythonPath: string, gitcdPath: string } {
    const config = vscode.workspace.getConfiguration('gitcd');
    const useBundled = config.get<boolean>('useBundledPython', true);

    if (useBundled) {
        const venvPath = path.join(context.extensionPath, 'python-env');
        return {
            pythonPath: path.join(venvPath, 'bin', 'python'),
            gitcdPath: path.join(venvPath, 'bin', 'git-cd')
        };
    } else {
        let pythonPath = config.get<string>('pythonPath', '/usr/bin/python3');
        let gitcdPath = config.get<string>('gitcdPath', '~/.local/bin/git-cd');

        // Expand ~ to home directory
        pythonPath = pythonPath.startsWith('~') ? pythonPath.replace('~', os.homedir()) : pythonPath;
        gitcdPath = gitcdPath.startsWith('~') ? gitcdPath.replace('~', os.homedir()) : gitcdPath;

        return { pythonPath, gitcdPath };
    }
}

async function runGitCdCommand(context: vscode.ExtensionContext, args: string[]): Promise<void> {
    const config = vscode.workspace.getConfiguration('gitcd');
    const showOutput = config.get<boolean>('showOutputOnExecution', true);

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
    }

    if (showOutput) {
        outputChannel.show(true);
    }

    const { pythonPath, gitcdPath } = getPythonAndGitcdPaths(context);

    outputChannel.appendLine(`Checking paths...`);
    outputChannel.appendLine(`Extension path: ${context.extensionPath}`);
    outputChannel.appendLine(`Python: ${pythonPath} (exists: ${fs.existsSync(pythonPath)})`);
    outputChannel.appendLine(`Git-CD: ${gitcdPath} (exists: ${fs.existsSync(gitcdPath)})`);

    // Check if files exist
    if (!fs.existsSync(pythonPath)) {
        vscode.window.showErrorMessage(`Python not found at: ${pythonPath}. Please check settings.`, 'Open Settings')
            .then(sel => sel === 'Open Settings' && vscode.commands.executeCommand('workbench.action.openSettings', 'gitcd'));
        return;
    }

    if (!fs.existsSync(gitcdPath)) {
        vscode.window.showErrorMessage(`Git-CD not found at: ${gitcdPath}. Please check settings or reinstall extension.`, 'Open Settings')
            .then(sel => sel === 'Open Settings' && vscode.commands.executeCommand('workbench.action.openSettings', 'gitcd'));
        return;
    }

    outputChannel.appendLine(`Running: git-cd ${args.join(' ')}`);
    outputChannel.appendLine(`Working directory: ${workspaceFolder.uri.fsPath}`);

    // Find SSH auth socket
    const sshAuthSock = findSshAuthSocket();
    outputChannel.appendLine(`SSH_AUTH_SOCK: ${sshAuthSock || '(not found)'}`);
    outputChannel.appendLine('---');

    return new Promise((resolve, reject) => {
        const env: NodeJS.ProcessEnv = {
            ...process.env,
            HOME: os.homedir(),
            USER: process.env.USER || os.userInfo().username,
            // Force git-cd to run in non-interactive mode if possible
            GITCD_INTERACTIVE: 'false',
            GIT_TERMINAL_PROMPT: '0'
        };

        // Add SSH auth socket if found
        if (sshAuthSock) {
            env.SSH_AUTH_SOCK = sshAuthSock;
        }

        // Pass GPG TTY for signing commits if configured
        if (process.env.GPG_TTY) {
            env.GPG_TTY = process.env.GPG_TTY;
        }

        const child = spawn(pythonPath, [gitcdPath, ...args], {
            cwd: workspaceFolder.uri.fsPath,
            env: env,
            shell: false,
            stdio: ['pipe', 'pipe', 'pipe']  // Enable stdin for interactive prompts
        });

        let stdout = '';
        let stderr = '';
        let pendingOutput = '';  // Buffer for incomplete lines

        child.stdout.on('data', async (data) => {
            const output = data.toString();
            stdout += output;

            // Strip ANSI codes for display and question detection
            const cleanOutput = stripAnsiCodes(output);

            // Split into lines, trim each, remove lines that are only whitespace, then rejoin
            const cleanedLines = cleanOutput.split('\n').map(line => {
                const trimmed = line.trimEnd();
                return trimmed;
            }).join('\n');

            outputChannel.append(cleanedLines);

            // Add to pending buffer
            pendingOutput += output;

            // Detect if git-cd is asking a question (common patterns)
            const yesNoPatterns = [
                /\[y\/n\]/i,  // Contains [y/n]
                /\(yes\/no\)/i,  // Contains (yes/no)
            ];

            const textInputPatterns = [
                /\?\s*$/,  // Ends with ?
                /Default:\s*.+$/m,  // Contains "Default: something"
                /continue\?/i,
                /proceed\?/i,
                /do you want/i
            ];

            const hasYesNoQuestion = yesNoPatterns.some(pattern => pattern.test(cleanOutput));
            const hasTextInputQuestion = textInputPatterns.some(pattern => pattern.test(cleanOutput));

            if ((hasYesNoQuestion || hasTextInputQuestion) && child.stdin.writable) {
                // Extract the question text from accumulated output
                const cleanPendingOutput = stripAnsiCodes(pendingOutput);
                const lines = cleanPendingOutput.trim().split('\n');

                // Find the line with the actual question (usually contains '?')
                let questionText = '';
                let defaultValue = '';

                for (let i = lines.length - 1; i >= 0; i--) {
                    const line = lines[i].trim();
                    if (line.includes('?')) {
                        questionText = line;
                        break;
                    }
                }

                // If we didn't find a '?', use the last non-empty line
                if (!questionText) {
                    questionText = lines.filter(l => l.trim()).pop() || cleanOutput.trim();
                }

                // Check for default value pattern
                const defaultMatch = cleanPendingOutput.match(/Default:\s*(.+?)$/m);
                if (defaultMatch) {
                    defaultValue = defaultMatch[1].trim();
                }

                if (hasYesNoQuestion) {
                    // Remove trailing [y/n] or (yes/no) from question text for cleaner display
                    questionText = questionText.replace(/\s*\[y\/n\]\s*:?\s*$/i, '');
                    questionText = questionText.replace(/\s*\(yes\/no\)\s*:?\s*$/i, '');

                    // Show VSCode quick pick for yes/no questions
                    const answer = await vscode.window.showQuickPick(['Yes', 'No'], {
                        placeHolder: questionText,
                        title: 'Git-CD Question'
                    });

                    if (answer) {
                        const response = answer.toLowerCase() + '\n';  // Send full 'yes' or 'no'
                        child.stdin.write(response);
                        outputChannel.appendLine(`[User selected: ${answer}]`);
                    } else {
                        // User cancelled - send 'no' and kill process
                        child.stdin.write('no\n');
                        child.kill();
                    }
                } else {
                    // Text input question
                    const answer = await vscode.window.showInputBox({
                        prompt: questionText,
                        value: defaultValue,
                        placeHolder: defaultValue ? `Default: ${defaultValue}` : 'Enter value'
                    });

                    if (answer !== undefined) {
                        const response = answer + '\n';
                        child.stdin.write(response);
                        outputChannel.appendLine(`[User entered: ${answer || '(empty - using default)'}]`);
                    } else {
                        // User cancelled - kill process
                        child.kill();
                    }
                }

                // Clear pending output after handling question
                pendingOutput = '';
            }
        });

        child.stderr.on('data', (data) => {
            const output = data.toString();
            stderr += output;
            // Strip ANSI codes from stderr too and clean up whitespace
            const cleanOutput = stripAnsiCodes(output);
            const cleanedLines = cleanOutput.split('\n').map(line => line.trimEnd()).join('\n');
            outputChannel.append(cleanedLines);
        });

        child.on('error', (error) => {
            outputChannel.appendLine(`Error: ${error.message}`);
            vscode.window.showErrorMessage(
                `Git-CD error: ${error.message}`,
                'Open Settings'
            ).then(selection => {
                if (selection === 'Open Settings') {
                    vscode.commands.executeCommand('workbench.action.openSettings', 'gitcd');
                }
            });
            reject(error);
        });

        child.on('close', (code) => {
            outputChannel.appendLine('');
            if (code === 0) {
                vscode.window.showInformationMessage(`Git-CD: ${args[0]} completed successfully`);
                resolve();
            } else {
                outputChannel.appendLine(`Process exited with code ${code}`);
                vscode.window.showErrorMessage(`Git-CD ${args[0]} failed with code ${code}`);
                reject(new Error(`Process exited with code ${code}`));
            }
        });
    });
}

async function runGitCdCommandWithInput(context: vscode.ExtensionContext, args: string[], prompt: string): Promise<void> {
    const input = await vscode.window.showInputBox({
        prompt: prompt,
        placeHolder: 'Leave empty to use current branch/default'
    });

    // If user cancels, don't run the command
    if (input === undefined) {
        return;
    }

    // Add input to args if provided
    const commandArgs = input ? [...args, input] : args;
    await runGitCdCommand(context, commandArgs);
}
