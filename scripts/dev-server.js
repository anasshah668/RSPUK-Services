import { spawn } from 'child_process';
import dotenv from 'dotenv';

dotenv.config();

const PORT = process.env.PORT || 5000;

async function startDevServer() {
  console.log(`🚀 Starting dev server on port ${PORT} with nodemon...`);
  
  // Start the server with nodemon
  const server = spawn('npx', ['nodemon', 'server.js'], {
    stdio: 'inherit',
    shell: true,
    cwd: process.cwd(),
  });
  
  server.on('error', (error) => {
    console.error('Failed to start dev server:', error);
    process.exit(1);
  });
  
  server.on('exit', (code) => {
    if (code !== 0) {
      console.error(`Dev server exited with code ${code}`);
      process.exit(code);
    }
  });
  
  // Handle process termination
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down dev server...');
    server.kill('SIGINT');
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    console.log('\n🛑 Shutting down dev server...');
    server.kill('SIGTERM');
    process.exit(0);
  });
}

startDevServer();
