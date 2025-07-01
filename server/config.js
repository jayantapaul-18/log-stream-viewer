module.exports = {
  "logs": {
    "DB": "/Users/jp18/ai-code/log-stream-viewer/server_output.log",
    "db_audit_log": "/Users/jp18/DocumentDB/logs/documentdb-dev.log",
    "db_logs": "/Users/jp18/DocumentDB/logs"
  },
  "logDir": "/Users/jp18/programming/rust/TitanDB/logs",
  "port": 5008,
  "maxFileSize": 52428800,
  "rateLimit": {
    "windowMs": 900000,
    "max": 100
  }
};