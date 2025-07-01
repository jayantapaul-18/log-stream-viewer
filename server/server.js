const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

const activeTails = new Map(); // Moved declaration to the top

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? false : '*',
    methods: ['GET', 'POST']
  }
});

const config = require("./config");

// Security middleware
app.use(helmet());
app.use(compression());
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? false : '*'
}));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: 'Too many requests, please try again later.'
});

app.use('/api', apiLimiter);

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Helper: scan logDir for files with stats
function scanLogDir(dir) {
  try {
    const files = fs.readdirSync(dir, { withFileTypes: true });
    
    return files
      .filter(file => {
        // Skip hidden files and directories
        if (file.name.startsWith('.')) return false;
        
        // Only include log files by default, or all files if in browser mode
        return file.isDirectory() || file.name.endsWith('.log') || file.name.endsWith('.txt');
      })
      .map(file => {
        const fullPath = path.join(dir, file.name);
        const stats = fs.statSync(fullPath);
        
        return {
          name: file.name,
          path: fullPath,
          isDirectory: file.isDirectory(),
          size: stats.size,
          modified: stats.mtime,
          created: stats.birthtime,
          extension: path.extname(file.name).toLowerCase()
        };
      });
  } catch (e) {
    console.error(`Failed to read directory ${dir}:`, e);
    throw new Error(`Failed to read directory: ${e.message}`);
  }
}

// Helper: Check if a path is within the allowed directory
function isPathAllowed(filePath, baseDir) {
  // Resolve to absolute paths and normalize
  const resolvedPath = path.resolve(filePath);
  const resolvedBase = path.resolve(baseDir);
  
  // Check if the resolved path starts with the base directory
  return resolvedPath.startsWith(resolvedBase);
}

function getSources() {
  try {
    const dirLogs = scanLogDir(config.logDir).reduce((acc, cur) => {
      if (!cur.isDirectory) {
        acc[cur.name] = {
          path: cur.path,
          size: cur.size,
          modified: cur.modified
        };
      }
      return acc;
    }, {});

    // Merge fixed logs + dir logs
    return { ...config.logs, ...dirLogs };
  } catch (error) {
    console.error('Error getting sources:', error);
    return { ...config.logs };
  }
}

const apiRouter = express.Router();

apiRouter.get("/sources", (req, res) => {
  try {
    res.json({
      success: true,
      data: getSources(),
      currentDir: config.logDir,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting sources:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load log sources',
      details: error.message
    });
  }
});

apiRouter.get("/dir", (req, res) => {
  try {
    let dir = req.query.path || config.logDir;
    
    // Resolve to absolute path and normalize
    dir = path.resolve(dir);
    
    // Security: Ensure the path is within the allowed directory
    if (!isPathAllowed(dir, config.logDir)) {
      console.warn(`Access denied to path: ${dir} (outside of ${config.logDir})`);
      return res.status(403).json({
        success: false,
        error: 'Access denied',
        message: 'Cannot access paths outside the configured log directory'
      });
    }
    
    // Check if directory exists and is accessible
    if (!fs.existsSync(dir)) {
      return res.status(404).json({
        success: false,
        error: 'Directory not found',
        path: dir
      });
    }
    
    if (!fs.statSync(dir).isDirectory()) {
      return res.status(400).json({
        success: false,
        error: 'Path is not a directory',
        path: dir
      });
    }
    
    const items = scanLogDir(dir);
    
    // Get parent directory if not at root
    const parentDir = path.dirname(dir);
    const hasParent = parentDir !== dir && isPathAllowed(parentDir, config.logDir);
    
    res.json({
      success: true,
      path: dir,
      parent: hasParent ? parentDir : null,
      items: items,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('Error reading directory:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to read directory',
      message: error.message,
      path: req.query.path || config.logDir
    });
  }
});

apiRouter.get("/search", (req, res) => {
  try {
    const query = req.query.q || '';
    const searchPath = config.logDir;

    if (!query) {
      return res.json({ success: true, items: [] });
    }

    const allFiles = [];
    const search = (dir) => {
      const items = scanLogDir(dir);
      for (const item of items) {
        if (item.name.toLowerCase().includes(query.toLowerCase()) || item.path.toLowerCase().includes(query.toLowerCase())) {
          allFiles.push(item);
        }
        if (item.isDirectory) {
          search(item.path);
        }
      }
    };

    search(searchPath);

    res.json({ success: true, items: allFiles });

  } catch (error) {
    console.error('Error searching files:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to search files',
      message: error.message
    });
  }
});

apiRouter.get("/download", (req, res) => {
  try {
    const filePath = req.query.path;

    if (!filePath) {
      return res.status(400).json({ success: false, error: 'File path is required' });
    }

    if (!isPathAllowed(filePath, config.logDir)) {
      console.warn(`Access denied to path: ${filePath} (outside of ${config.logDir})`);
      return res.status(403).json({ success: false, error: 'Access to file denied' });
    }

    const stats = fs.statSync(filePath);
    if (stats.size > config.maxFileSize) {
      return res.status(400).json({
        success: false,
        error: `File too large (${(stats.size / (1024 * 1024)).toFixed(2)}MB). Maximum allowed: ${config.maxFileSize / (1024 * 1024)}MB`
      });
    }

    const fileContent = fs.readFileSync(filePath, 'utf8');
    res.json({
      success: true,
      filename: path.basename(filePath),
      content: fileContent,
      size: stats.size,
      lastModified: stats.mtime
    });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Download error:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});



app.use('/api', apiRouter);

// Serve static files from React app
const clientBuildPath = path.join(__dirname, "../client/build");
if (fs.existsSync(clientBuildPath)) {
  app.use(express.static(clientBuildPath));
  
  // Handle React routing, return all requests to React app
  app.get('*', (req, res, next) => {
    // Don't serve index.html for API requests
    if (req.path.startsWith('/api/')) {
      return next();
    }
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  });
} else {
  console.warn('Client build not found. Running in API-only mode.');
}

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// Handle 404
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`
  });
});

// Clean up old tail processes
function cleanupTailProcesses() {
  const now = Date.now();
  const timeout = 5 * 60 * 1000; // 5 minutes
  
  activeTails.forEach((processInfo, socketId) => {
    if (now - processInfo.lastActivity > timeout) {
      console.log(`Cleaning up inactive tail process for socket ${socketId}`);
      if (processInfo.process) {
        processInfo.process.kill();
      }
      activeTails.delete(socketId);
    }
  });
}

// Run cleanup every minute
setInterval(cleanupTailProcesses, 60 * 1000);

io.on("connection", (socket) => {
  const clientId = socket.id;
  console.log(`[${new Date().toISOString()}] Client connected: ${clientId}`);
  
  // Initialize client state
  socket.clientState = {
    currentFile: null,
    isPaused: false,
    lastActivity: Date.now()
  };
  
  // Send initial sources
  socket.emit('sources', getSources());

  // Handle client disconnection
  socket.on('disconnect', () => {
    console.log(`[${new Date().toISOString()}] Client disconnected: ${clientId}`);
    // Clean up any active tail process for this client
    if (activeTails.has(clientId)) {
      const { process: tailProcess } = activeTails.get(clientId);
      if (tailProcess && !tailProcess.killed) {
        tailProcess.kill();
      }
      activeTails.delete(clientId);
    }
  });

  // Handle pause/resume
  socket.on('pause', (isPaused) => {
    socket.clientState.isPaused = isPaused;
    socket.clientState.lastActivity = Date.now();
    // Update last activity for the tail process as well
    const tailInfo = activeTails.get(clientId);
    if (tailInfo) {
      tailInfo.lastActivity = Date.now();
    }
  });

  // Handle file tailing
  socket.on("start", (sourceKeyOrPath) => {
    try {
      socket.clientState.lastActivity = Date.now();
      console.log(`[${new Date().toISOString()}] [${clientId}] Received start event for: ${sourceKeyOrPath}`);

      let file;
      // Determine if sourceKeyOrPath is a direct file path or a source key
      if (path.isAbsolute(sourceKeyOrPath)) {
        file = sourceKeyOrPath;
      } else {
        const availableSources = getSources();
        const sourceInfo = availableSources[sourceKeyOrPath];
        
        if (!sourceInfo || !sourceInfo.path) {
          const errorMessage = `ERROR: Invalid source key provided: ${sourceKeyOrPath}`;
          console.error(`[${new Date().toISOString()}] [${clientId}] ${errorMessage}`);
          socket.emit("log", { type: 'error', message: errorMessage });
          return;
        }
        file = sourceInfo.path;
      }
      
      // Security check
      if (!isPathAllowed(file, config.logDir)) {
        const errorMessage = `ERROR: Access to file denied: ${file}`;
        console.error(`[${new Date().toISOString()}] [${clientId}] ${errorMessage}`);
        socket.emit("log", { type: 'error', message: errorMessage });
        return;
      }

      // Check file size
      try {
        const stats = fs.statSync(file);
        if (stats.size > config.maxFileSize) {
          const errorMessage = `ERROR: File too large (${(stats.size / (1024 * 1024)).toFixed(2)}MB). Maximum allowed: ${config.maxFileSize / (1024 * 1024)}MB`;
          console.error(`[${new Date().toISOString()}] [${clientId}] ${errorMessage}`);
          socket.emit("log", { type: 'error', message: errorMessage });
          return;
        }
      } catch (err) {
        const errorMessage = `ERROR: Cannot access file: ${file}. It may not exist or you don't have permissions.`;
        console.error(`[${new Date().toISOString()}] [${clientId}] ${errorMessage}`, err);
        socket.emit("log", { type: 'error', message: errorMessage });
        return;
      }

      console.log(`[${new Date().toISOString()}] [${clientId}] Tailing file: ${file}`);

      // Clean up any existing tail process for this client
      if (activeTails.has(clientId)) {
        const { process: existingProcess } = activeTails.get(clientId);
        if (existingProcess && !existingProcess.killed) {
          console.log(`[${new Date().toISOString()}] [${clientId}] Killing previous tail process.`);
          existingProcess.kill();
        }
      }
    // Start new tail process
    const tailProcess = spawn("tail", ["-f", "-n", "100", file]);
    
    // Store process info
    activeTails.set(clientId, {
      process: tailProcess,
      file: file,
      startTime: new Date(),
      lastActivity: Date.now()
    });
    
    // Update client state
    socket.clientState.currentFile = file;
    socket.clientState.isPaused = false;
    
    // Send initial file info
    const stats = fs.statSync(file);
    socket.emit("fileInfo", {
      name: path.basename(file),
      path: file,
      size: stats.size,
      modified: stats.mtime,
      created: stats.birthtime
    });

    // Handle stdout data
    tailProcess.stdout.on("data", (data) => {
      if (!socket.clientState.isPaused) {
        const lines = data.toString().split("\n").filter(Boolean);
        lines.forEach(line => {
          socket.emit("log", { 
            type: 'data', 
            message: line,
            timestamp: new Date().toISOString()
          });
          
          // Update last activity
          const tailInfo = activeTails.get(clientId);
          if (tailInfo) {
            tailInfo.lastActivity = Date.now();
          }
        });
      }
    });

    // Handle stderr
    tailProcess.stderr.on("data", (data) => {
      const errorMessage = data.toString().trim();
      console.error(`[${new Date().toISOString()}] [${clientId}] Tail stderr:`, errorMessage);
      socket.emit("log", { 
        type: 'error', 
        message: errorMessage,
        timestamp: new Date().toISOString()
      });
    });

    // Handle process exit
    tailProcess.on("close", (code) => {
      console.log(`[${new Date().toISOString()}] [${clientId}] Tail process for ${file} exited with code ${code}`);
      if (code !== 0 && code !== null) {
        socket.emit("log", { 
          type: 'warning', 
          message: `Tail process exited with code ${code}`,
          timestamp: new Date().toISOString()
        });
      }
      
      // Clean up
      if (activeTails.get(clientId)?.process?.pid === tailProcess.pid) {
        activeTails.delete(clientId);
      }
    });
    
    // Send success message
    socket.emit("log", { 
      type: 'info', 
      message: `Now tailing: ${file}`,
      timestamp: new Date().toISOString()
    });
    
      } catch (error) {
        console.error(`[${new Date().toISOString()}] [${clientId}] Error in start handler:`, error);
        socket.emit("log", { 
          type: 'error', 
          message: `Error: ${error.message}`,
          timestamp: new Date().toISOString()
        });
      }
    });
});

// Start the server
const PORT = process.env.PORT || config.port || 5008;
server.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] Server running on port ${PORT}`);
  console.log(`[${new Date().toISOString()}] Log directory: ${config.logDir}`);
  console.log(`[${new Date().toISOString()}] Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log(`[${new Date().toISOString()}] Shutting down server...`);
  
  // Close server
  server.close(() => {
    console.log(`[${new Date().toISOString()}] Server closed.`);
    
    // Kill all active tail processes
    activeTails.forEach(({ process: tailProcess }, clientId) => {
      if (tailProcess && !tailProcess.killed) {
        console.log(`[${new Date().toISOString()}] Killing tail process for client ${clientId}`);
        tailProcess.kill();
      }
    });
    
    process.exit(0);
  });
});
