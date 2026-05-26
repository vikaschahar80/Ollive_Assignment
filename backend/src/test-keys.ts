import * as dotenv from 'dotenv';
import path from 'path';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';

// Load environment variables directly from the backend/.env file
dotenv.config({ path: path.join(__dirname, '../.env') });

const openAIKey = process.env.OPENAI_API_KEY || '';
const geminiKey = process.env.GEMINI_API_KEY || '';

console.log('🔍 Running API Diagnostics...\n');
console.log(`🔑 Loaded OpenAI Key: ${openAIKey ? openAIKey.slice(0, 15) + '...' : 'NONE'}`);
console.log(`🔑 Loaded Gemini Key: ${geminiKey ? geminiKey.slice(0, 15) + '...' : 'NONE'}\n`);

async function testOpenAI() {
  if (!openAIKey) {
    console.log('⚠️ Skipping OpenAI test: No key provided in .env');
    return;
  }

  console.log('🤖 [OpenAI] Initiating API Completion Test...');
  try {
    const openai = new OpenAI({ apiKey: openAIKey });
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Say Hello!' }]
    });
    console.log('🟢 [OpenAI SUCCESS] Response:', JSON.stringify(response.choices[0].message));
  } catch (err: any) {
    console.log('🔴 [OpenAI FAILED] Error:', err.message);
    if (err.status) console.log(`   HTTP Code: ${err.status}`);
  }
}

async function testGemini() {
  if (!geminiKey) {
    console.log('⚠️ Skipping Gemini test: No key provided in .env');
    return;
  }

  console.log('\n🤖 [Gemini] Initiating API Completion Test (v1beta)...');
  try {
    const genAI = new GoogleGenerativeAI(geminiKey);
    // Let's try gemini-1.5-flash
    console.log('   Testing model: gemini-1.5-flash...');
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent('Say Hello!');
    console.log('🟢 [Gemini SUCCESS] Response:', result.response.text());
  } catch (err: any) {
    console.log('🔴 [Gemini FAILED] Error:', err.message);
  }

  console.log('\n🤖 [Gemini] Initiating API Completion Test (gemini-pro legacy)...');
  try {
    const genAI = new GoogleGenerativeAI(geminiKey);
    console.log('   Testing model: gemini-pro...');
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });
    const result = await model.generateContent('Say Hello!');
    console.log('🟢 [Gemini Legacy SUCCESS] Response:', result.response.text());
  } catch (err: any) {
    console.log('🔴 [Gemini Legacy FAILED] Error:', err.message);
  }
}

async function run() {
  await testOpenAI();
  await testGemini();
  console.log('\n🏁 Diagnostics complete.');
}

run();
