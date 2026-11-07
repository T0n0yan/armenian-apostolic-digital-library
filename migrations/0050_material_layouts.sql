-- Աղոթքների ձևավորումը (գլխավոր ադմինի խմբագիրը աղոթքի էջում)։ Telegram-ի տեքստից առանձին է,
-- սինքը այն չի ջնջում։ source_hash-ը այն Telegram-ի տեքստի նշանն է, որի վրա ձևավորվել է.
-- տեքստը Telegram-ում փոխվելու դեպքում ադմինը էջում զգուշացում է տեսնում։
CREATE TABLE material_layouts (
  chat_id TEXT NOT NULL,
  message_id INTEGER NOT NULL CHECK (message_id > 0),
  layout_json TEXT NOT NULL,
  source_hash TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (chat_id, message_id)
);
