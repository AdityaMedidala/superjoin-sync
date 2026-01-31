const BACKEND_URL = "https://web-production-645c3.up.railway.app";
const WEBHOOK = `${BACKEND_URL}/webhook`;


function setup() {
  // Remove old triggers to prevent duplicates
  ScriptApp.getProjectTriggers().forEach(t => {
    ScriptApp.deleteTrigger(t);
  });

  // Create new trigger for edits
  ScriptApp.newTrigger("onEditTrigger")
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onEdit()
    .create();

  alertSafe("✅ Sync system initialized. You can now edit the sheet.");
}

/***************************************************
 * 2. MAIN EDIT HANDLER (Sheet → DB)
 ***************************************************/
function onEditTrigger(e) {
  if (!e || !e.range) return;

  const range = e.range;
  const sheet = range.getSheet();
  const row = range.getRow();
  const col = range.getColumn();
  const value = e.value ?? "";

  // Ignore header row (Row 1)
  if (row === 1) return;

  // Block bulk edits (dragging/pasting multiple cells)
  if (range.getNumRows() > 1 || range.getNumColumns() > 1) {
    return; // Silently ignore bulk edits to save quota
  }

  // 1. Get ID (Column A) and Header (Row 1)
  const id = sheet.getRange(row, 1).getValue();
  const header = sheet.getRange(1, col).getValue();

  // Validate ID exists
  if (!id || id === "id") return;

  // 2. Data Validation
  if (header === "Age") {
    const age = Number(value);
    if (isNaN(age) || age < 0 || age > 150) {
      revert(range); // Undo the change
      return;
    }
  }

  if (header === "Email") {
    if (value && !value.includes("@")) {
      revert(range); // Undo the change
      return;
    }
  }

  // 3. Send Webhook to Backend
  const payload = {
    id: String(id),
    header: String(header),
    value: String(value)
  };

  sendWebhook(payload);
}

/***************************************************
 * HELPERS
 ***************************************************/
function sendWebhook(payload) {
  try {
    UrlFetchApp.fetch(WEBHOOK, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (e) {
    console.log("Network error:", e.message);
  }
}

function revert(range) {
  try {
    range.setValue(range.getOldValue());
    SpreadsheetApp.getUi().alert("❌ Invalid Input Reverted");
  } catch {}
}

function alertSafe(msg) {
  try {
    SpreadsheetApp.getUi().alert(msg);
  } catch {
    console.log(msg);
  }
}
