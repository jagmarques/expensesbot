import { initializeDatabase, closeDatabase } from './services/database/db';
import { initializeBot, startBot } from './services/telegram/bot';
import { startHealthServer } from './services/health/server';
import './config/env'; // Load environment variables

async function main(): Promise<void> {
  try {
    console.log('Starting ExpensesBot...');

    initializeDatabase();
    console.log('Database initialized');

    await initializeBot();
    console.log('Bot initialized');

    startHealthServer();

    await startBot();

    process.on('SIGINT', () => {
      console.log('\nShutting down...');
      closeDatabase();
      process.exit(0);
    });
  } catch (error) {
    console.error('Fatal error:', error);
    process.exit(1);
  }
}

main();
