// Test direct du controller
const ticketsController = require('./src/api/controllers/tickets.controller');

async function testController() {
  try {
    console.log('🔍 Test du controller...');
    
    const req = {
      body: {
        ticketCode: 'TICKET_123456789',
        ticketId: 'ticket_abc123'
      }
    };
    
    const res = {
      status: (code) => ({
        json: (data) => {
          console.log(`Status: ${code}`);
          console.log('Response:', JSON.stringify(data, null, 2));
          return { status: code, json: data };
        }
      })
    };
    
    const next = (error) => {
      console.error('❌ Erreur next():', error.message);
      console.error('Stack:', error.stack);
    };
    
    await ticketsController.generateQRCode(req, res, next);
    
  } catch (error) {
    console.error('❌ Erreur controller:', error.message);
    console.error('Stack:', error.stack);
  }
}

testController();
