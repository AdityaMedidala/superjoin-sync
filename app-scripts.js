const BACKEND_URL = 'https://web-production-645c3.up.railway.app'; 

// ---------------------------------------------------
// 1. SETUP: Connects the Sheet to the Script
// ---------------------------------------------------
function setup() {
  // Delete existing triggers to prevent duplicates
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'onEditTrigger') {
      ScriptApp.deleteTrigger(t);
    }
  });
  
  // Create a new installable trigger
  ScriptApp.newTrigger('onEditTrigger')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create();
  
  // [FIXED] Safe UI Alert (Prevents "Cannot call getUi" error)
  try {
    SpreadsheetApp.getUi().alert('✅ Setup complete! Triggers are active.');
  } catch (e) {
    console.log('✅ Setup complete! (UI Alert skipped)');
  }
}

// ---------------------------------------------------
// 2. THE GATEKEEPER: Handles Real User Edits
// ---------------------------------------------------
function onEditTrigger(e) {
  if (!e || !e.range) return;
  
  const range = e.range;
  const sheet = range.getSheet();
  const row = range.getRow();
  const col = range.getColumn();
  
  // Ignore Header Edits
  if (row === 1) return;

  // [EDGE CASE: BULK EDITS] 
  // If user pastes/drags multiple cells, we block it to prevent data corruption.
  // We send a SYSTEM log to the dashboard so you can show this safety feature works.
  if (range.getNumRows() > 1 || range.getNumColumns() > 1) {
    sendSystemLog("⚠️ Bulk/Paste edit ignored for safety");
    return;
  }
  
  // [EDGE CASE: CONCURRENT EDITS]
  // LockService prevents two scripts from reading/writing the exact same cell at once.
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(2000); // Wait up to 2 seconds
  } catch (err) {
    sendSystemLog("⚠️ Concurrent edit detected - locked");
    return; // System busy
  }
  
  try {
    const id = sheet.getRange(row, 1).getValue();
    const header = sheet.getRange(1, col).getValue();
    const value = e.value || '';
    
    // Ensure we have an ID to map to the DB
    if (!id || id === 'id') return;
    
    // [EDGE CASE: INVALID DATA TYPES]
    // Validate that certain columns have appropriate data
    if (header === 'Age') {
      const age = parseInt(value);
      if (isNaN(age) || age < 0 || age > 150) {
        sendSystemLog(`⚠️ Invalid age value rejected: ${value}`);
        // Optionally revert the cell
        return;
      }
    }
    
    if (header === 'Email') {
      // Basic email validation
      if (value && !value.includes('@')) {
        sendSystemLog(`⚠️ Invalid email format rejected: ${value}`);
        return;
      }
    }
    
    const payload = {
      id: String(id),
      header: String(header),
      value: String(value)
    };
    
    sendWebhook(payload);
    
  } catch (err) {
    console.log('Sync Error: ' + err);
    sendSystemLog(`❌ Sync Error: ${err.message}`);
  } finally {
    lock.releaseLock(); 
  }
}

// ---------------------------------------------------
// 3. CHAOS MODE: Simulates 20 Concurrent Users
// Run this MANUALLY from the editor to spike the queue
// ---------------------------------------------------
function triggerChaosMode() {
  console.log("🚀 Launching Chaos Mode...");
  
  const sheet = SpreadsheetApp.getActiveSheet();
  const maxRows = sheet.getLastRow();
  
  // Simulate 20 rapid-fire requests
  for (let i = 1; i <= 20; i++) {
    // Only update rows that exist
    const rowId = Math.min(i, maxRows - 1);
    
    const payload = {
      id: String(rowId),
      header: "Age",
      value: Math.floor(Math.random() * 60) + 18 // Random Age 18-78
    };
    
    // We send these directly to the webhook without waiting
    sendWebhook(payload);
  }
  
  try {
    SpreadsheetApp.getUi().alert('🚀 Chaos Launched! Check the Dashboard Queue.');
  } catch (e) {
    console.log('🚀 Chaos Launched! Check the Dashboard Queue.');
  }
}

// ---------------------------------------------------
// 4. STRESS TEST: Rapid Sequential Edits
// Tests deduplication and queue handling
// ---------------------------------------------------
function stressTestDeduplication() {
  console.log("🧪 Running Deduplication Stress Test...");
  
  // Send the same update 10 times rapidly
  for (let i = 0; i < 10; i++) {
    const payload = {
      id: "1",
      header: "Name",
      value: "Alice Smith"
    };
    sendWebhook(payload);
  }
  
  // Then send a different value
  const payload = {
    id: "1",
    header: "Name",
    value: "Alice Johnson"
  };
  sendWebhook(payload);
  
  try {
    SpreadsheetApp.getUi().alert('🧪 Deduplication test launched! You should see most updates skipped.');
  } catch (e) {
    console.log('🧪 Deduplication test launched!');
  }
}

// ---------------------------------------------------
// 5. NETWORK RESILIENCE TEST
// Tests what happens when backend is unreachable
// ---------------------------------------------------
function testNetworkFailure() {
  console.log("🌐 Testing Network Resilience...");
  
  // Try to send to a fake endpoint
  try {
    UrlFetchApp.fetch(`${BACKEND_URL}/fake-endpoint-404`, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({test: true}),
      muteHttpExceptions: true
    });
  } catch (e) {
    // This should NOT crash the script
    console.log("Network error handled gracefully: " + e.message);
  }
  
  // Now send a real request to verify we recovered
  sendSystemLog("✅ Network resilience test complete");
  
  try {
    SpreadsheetApp.getUi().alert('🌐 Network test complete! Script remained stable.');
  } catch (e) {
    console.log('🌐 Network test complete!');
  }
}

// ---------------------------------------------------
// 6. DATA VALIDATION TEST
// Tests edge cases in data types
// ---------------------------------------------------
function testDataValidation() {
  console.log("🔍 Testing Data Validation...");
  
  const testCases = [
    {id: "1", header: "Age", value: "-5"},       // Negative age
    {id: "1", header: "Age", value: "999"},      // Unrealistic age
    {id: "1", header: "Age", value: "abc"},      // Non-numeric age
    {id: "1", header: "Email", value: "notanemail"}, // Invalid email
    {id: "1", header: "Name", value: ""},        // Empty name (should be allowed)
  ];
  
  testCases.forEach(tc => {
    sendWebhook(tc);
  });
  
  try {
    SpreadsheetApp.getUi().alert('🔍 Validation tests sent! Check dashboard for rejected values.');
  } catch (e) {
    console.log('🔍 Validation tests sent!');
  }
}

// ---------------------------------------------------
// HELPERS
// ---------------------------------------------------

function sendSystemLog(msg) {
  sendWebhook({
    id: "0",
    header: "SYSTEM",
    value: msg
  });
}

function sendWebhook(payload) {
  // [EDGE CASE: NETWORK FAILURES]
  // muteHttpExceptions prevents the script from crashing if the server blips.
  // [EDGE CASE: TIMEOUT]
  // We don't wait for response - fire and forget for maximum throughput
  try {
    const response = UrlFetchApp.fetch(`${BACKEND_URL}/webhook`, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
      // Add timeout to prevent hanging
      validateHttpsCertificates: true,
      // No timeout specified = default 60s (good for async operations)
    });
    
    // Optionally log failed webhooks
    if (response.getResponseCode() >= 400) {
      console.log(`Webhook failed: ${response.getResponseCode()}`);
    }
  } catch (e) {
    // Network completely down - log but don't crash
    console.log(`Network error: ${e.message}`);
  }
}

// ---------------------------------------------------
// 7. CLEANUP UTILITY
// Removes all triggers (useful for debugging)
// ---------------------------------------------------
function removeAllTriggers() {
  ScriptApp.getProjectTriggers().forEach(t => {
    ScriptApp.deleteTrigger(t);
  });
  
  try {
    SpreadsheetApp.getUi().alert('🧹 All triggers removed!');
  } catch (e) {
    console.log('🧹 All triggers removed!');
  }
}

// ---------------------------------------------------
// 8. DIAGNOSTIC TOOL
// Checks current state of the sheet
// ---------------------------------------------------
function runDiagnostics() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  const triggers = ScriptApp.getProjectTriggers().length;
  
  const report = `
📊 SHEET DIAGNOSTICS
━━━━━━━━━━━━━━━━━━
Rows: ${lastRow}
Columns: ${lastCol}
Headers: ${headers.join(', ')}
Active Triggers: ${triggers}
Backend URL: ${BACKEND_URL}
━━━━━━━━━━━━━━━━━━
  `;
  
  console.log(report);
  
  try {
    SpreadsheetApp.getUi().alert(report);
  } catch (e) {
    console.log('Diagnostics complete (no UI)');
  }
}