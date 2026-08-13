# Quick Assist History + AI Formatting Fix

- Quick Assist messages are now persisted per Pet Owner using the existing Expo SecureStore package.
- User and AI messages remain available after leaving Quick Assist or reopening the app.
- History is stored message-by-message so the conversation is not reset on screen remount.
- AI output is cleaned centrally in `src/api/aiService.js`.
- Asterisks are removed from every AI response, including:
  - Quick Assist
  - Pet Owner Medical Records AI Health Analysis
- The AI system prompt also requests plain-text responses without Markdown asterisks.
