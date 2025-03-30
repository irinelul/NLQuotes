/**
 * Database Connection Test Script
 * Run with: node test-db-connection.js
 */
import dotenv from 'dotenv';
import pg from 'pg';
const { Client } = pg;

// Load environment variables
dotenv.config();

// Check if DATABASE_URL exists
if (!process.env.DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is not set.');
  console.error('Please create a .env file with DATABASE_URL=postgres://user:password@host:port/database');
  process.exit(1);
}

console.log('Testing database connection...');
console.log(`Database URL: ${process.env.DATABASE_URL.replace(/:[^:]*@/, ':****@')}`);

// Create a client with SSL enabled
const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false 
  }
});

// Connect with detailed error reporting
async function testConnection() {
  try {
    console.log('Connecting to PostgreSQL...');
    console.time('Connection Time');
    await client.connect();
    console.timeEnd('Connection Time');
    
    console.log('Connection successful! Running test query...');
    const result = await client.query('SELECT version(), current_timestamp, current_database()');
    console.log('PostgreSQL Version:', result.rows[0].version);
    console.log('Current Timestamp:', result.rows[0].current_timestamp);
    console.log('Database Name:', result.rows[0].current_database);
    
    // Test a sample query
    try {
      console.log('Testing query on quotes table...');
      const countResult = await client.query('SELECT COUNT(*) FROM quotes');
      console.log(`Total quotes in database: ${countResult.rows[0].count}`);
    } catch (queryError) {
      console.error('Error querying quotes table:', queryError.message);
      console.log('This might be expected if the table doesn\'t exist yet.');
    }
    
    console.log('Tests completed successfully!');
  } catch (error) {
    console.error('ERROR: Connection failed');
    console.error('Error details:', error.message);
    console.error('Full error object:', error);
    
    // Provide troubleshooting advice
    console.log('\nTROUBLESHOOTING TIPS:');
    console.log('1. Check if your DATABASE_URL is correct');
    console.log('2. Ensure the database server is running and accessible');
    console.log('3. Check if SSL is properly configured');
    console.log('4. Verify your IP address is allowed to connect to the database');
    
    if (error.message.includes('SSL')) {
      console.log('\nSSL SPECIFIC TIPS:');
      console.log('- Your database appears to require SSL/TLS connections');
      console.log('- Try connecting with different SSL settings');
      console.log('- Check if you need a client certificate');
    }
  } finally {
    // Always close the client
    await client.end();
    console.log('Connection closed');
  }
}

testConnection().catch(err => {
  console.error('Unhandled error in test script:', err);
  process.exit(1);
}); 