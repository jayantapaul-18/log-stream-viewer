# Log Stream Viewer

A real-time log streaming application with a React frontend and a Node.js backend.

## Features

- Real-time log streaming using Socket.IO
- Browse and select log files from a specified directory
- Filter logs by search query
- Pause/resume log streaming
- Dark/light theme toggle
- Download selected log files

## Setup

To get the application up and running, follow these steps:

### 1. Clone the repository (if you haven't already)

```bash
git clone <repository-url>
cd log-stream-viewer
```

### 2. Backend Setup

Navigate to the root directory of the project (`log-stream-viewer/`).

```bash
npm install express socket.io --save
```

#### Configuration

Edit `server/config.js` to specify your log directory and other settings.

```javascript
// server/config.js
module.exports = {
  port: 5008,
  logDir: '/var/log', // <--- IMPORTANT: Set your desired log directory here
  maxFileSize: 100 * 1024 * 1024, // 100 MB
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
  },
  logs: {
    // You can define specific log files here, e.g.:
    // "nginx-access": "/var/log/nginx/access.log",
    // "syslog": "/var/log/syslog"
  }
};
```

### 3. Frontend Setup

Navigate to the `client` directory:

```bash
cd client
npm install
```

### 4. Build the Frontend

From the `client` directory, build the React application for production:

```bash
npm run build
```

This will create a `build` directory inside `client`, which the Node.js server will serve.

### 5. Start the Backend Server

Navigate back to the root directory of the project (`log-stream-viewer/`):

```bash
node server.js
```

Alternatively, you can use the provided `start.sh` script:

```bash
./start.sh
```

### 6. Access the Application

Once the server is running, open your web browser and go to:

```
🚀 Log viewer running at http://localhost:5008
```

You should now be able to browse your log files and stream their content in real-time.

## Git Configuration and Standards

To ensure a consistent development workflow and codebase quality, please adhere to the following guidelines:

### Git Configuration

It's recommended to configure your Git client with these settings:

*   **Line Endings:**
    *   For Windows users: `git config --global core.autocrlf true`
    *   For macOS/Linux users: `git config --global core.autocrlf input`
    This helps prevent issues with line ending differences across operating systems.
*   **Default Editor:** Set your preferred text editor for Git operations (e.g., commit messages).
    *   `git config --global core.editor "code --wait"` (for VS Code)
    *   `git config --global core.editor "nano"` (for Nano)

### Standard Notes

*   **Branching Strategy:** We use a simplified GitHub Flow.
    *   Create a new branch from `main` for each new feature or bug fix: `git checkout -b feature/your-feature-name` or `git checkout -b bugfix/issue-description`.
    *   Keep your branches small and focused on a single task.
    *   Regularly pull changes from `main` into your feature branch to avoid large merge conflicts.
*   **Commit Messages:** We enforce [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/).
    *   To create a commit, use `npm run commit` instead of `git commit`.
    *   This will guide you through an interactive prompt to ensure your commit message adheres to the standard.
    *   Example:
        ```
        feat: Add user authentication

        Implement user registration and login functionality using JWT.
        Includes password hashing and token validation.
        ```
    *   **Benefits of Conventional Commits:**
        *   Automated CHANGELOG generation.
        *   Easier to understand the history of the project.
        *   Improved collaboration and code reviews.
        *   Enables automated semantic versioning.
*   **Code Style:** Adhere to the existing code style within the project.
    *   Use consistent indentation (2 spaces for JavaScript/React, 4 spaces for Python).
    *   Follow naming conventions (e.g., `camelCase` for JavaScript variables/functions, `PascalCase` for React components).
    *   Prioritize readability and maintainability.
*   **Linting:** Ensure your code passes linting checks before committing.
    *   For JavaScript/React, run `npm run lint` (if configured) in the `client` directory.
*   **Testing:** If applicable, write unit or integration tests for new features or bug fixes.
    *   Run tests using `npm test` (if configured) in the `client` directory.
*   **Pull Requests (PRs):**
    *   Open a pull request to `main` when your feature or bug fix is complete and tested.
    *   Provide a clear description of the changes and any relevant context.
    *   Request reviews from at least one other team member.
