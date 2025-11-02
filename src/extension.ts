import * as vscode from 'vscode';
import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const execAsync = promisify(exec);
let outputChannel: vscode.OutputChannel;

export function activate(context: vscode.ExtensionContext) {
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
    outputChannel.appendLine(`Python: ${pythonPath}`);
    outputChannel.appendLine(`Git-CD: ${gitcdPath}`);
    outputChannel.appendLine(`Working directory: ${workspaceFolder.uri.fsPath}`);
    outputChannel.appendLine('---');

    return new Promise((resolve, reject) => {
        const env = { 
            ...process.env,
            HOME: os.homedir(),
            USER: process.env.USER || os.userInfo().username,
        };

        const child = spawn(pythonPath, [gitcdPath, ...args], {
            cwd: workspaceFolder.uri.fsPath,
            env: env,
            shell: false
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data) => {
            const output = data.toString();
            stdout += output;
            outputChannel.append(output);
        });

        child.stderr.on('data', (data) => {
            const output = data.toString();
            stderr += output;
            outputChannel.append(output);
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
