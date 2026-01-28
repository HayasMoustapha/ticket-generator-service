// Test du ValidationMiddleware
const { ValidationMiddleware } = require('./src/api/routes/tickets.routes.js');

async function testValidation() {
  try {
    console.log('🔍 Test du ValidationMiddleware...');
    
    const schema = require('joi').object({
      ticketCode: require('joi').string().required(),
      ticketId: require('joi').string().required()
    });
    
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
    
    const middleware = ValidationMiddleware.validate(schema);
    await middleware(req, res, next);
    
  } catch (error) {
    console.error('❌ Erreur ValidationMiddleware:', error.message);
    console.error('Stack:', error.stack);
  }
}

testValidation();
