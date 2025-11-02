VSCode Extension for git-cd
============================

A Visual Studio Code extension that integrates the git-cd continuous delivery workflow tool directly into your editor.

Features
--------

This extension provides Command Palette integration for all git-cd commands:

- **Git-CD: Initialize** - Set up git-cd in your repository
- **Git-CD: Start Feature** - Create a new feature branch
- **Git-CD: Refresh Feature** - Update feature branch with master
- **Git-CD: Test Feature** - Merge feature to test branch
- **Git-CD: Review** - Open a pull request
- **Git-CD: Status** - Check pull request status
- **Git-CD: Finish Feature** - Merge feature to master
- **Git-CD: Compare** - Compare branches or tags
- **Git-CD: Release** - Create a new release tag
- **Git-CD: Clean Branches** - Remove stale local branches
- **Git-CD: Check Version** - Display git-cd version
- **Git-CD: Upgrade** - Upgrade git-cd to latest version


Installation
------------

Method 1: Install from VSIX (Manual Installation)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

1. Build the extension package:

   .. code-block:: bash

       cd /var/home/claudio/Development/vscode-extension
       npm install
       npm run compile
       npx vsce package

2. Install the generated .vsix file:

   .. code-block:: bash

       code --install-extension gitcd-vscode-0.0.1.vsix

   Or in VSCode:
   - Press ``Ctrl+Shift+P``
   - Type "Extensions: Install from VSIX"
   - Select the generated ``.vsix`` file

Method 2: Development Mode
~~~~~~~~~~~~~~~~~~~~~~~~~~~

1. Open the extension folder in VSCode:

   .. code-block:: bash

       code /var/home/claudio/Development/vscode-extension

2. Press ``F5`` to launch Extension Development Host
3. Test the extension in the new VSCode window

Method 3: Symlink (Quick Testing)
~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

1. Compile the extension:

   .. code-block:: bash

       cd /var/home/claudio/Development/vscode-extension
       npm install
       npm run compile

2. Create a symlink in your VSCode extensions folder:

   .. code-block:: bash

       ln -s /var/home/claudio/Development/vscode-extension ~/.vscode/extensions/gitcd-vscode

3. Restart VSCode or run "Developer: Reload Window"

Usage
-----

1. Open a git repository in VSCode
2. Press ``Ctrl+Shift+P`` to open Command Palette
3. Type "Git-CD" to see all available commands
4. Select the command you want to run

The output will be shown in the "Git-CD" output channel.

Configuration
-------------

Access settings via File → Preferences → Settings, then search for "gitcd":

- **gitcd.pythonPath**: Path to Python 3 executable (default: ``python3``)
- **gitcd.gitcdPath**: Path to git-cd executable (default: ``git-cd``)
- **gitcd.showOutputOnExecution**: Auto-show output panel (default: ``true``)

Development
-----------

Build and watch for changes:

.. code-block:: bash

    npm run watch

Run tests:

.. code-block:: bash

    npm run test

Package for distribution:

.. code-block:: bash

    npx vsce package

License
-------

Apache License 2.0
