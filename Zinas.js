(function () {
  const LS_CHAT_PREFIX = "pdd_chat_v1_";

  function conversationKey(emailA, emailB) {
    const a = String(emailA || "").trim().toLowerCase();
    const b = String(emailB || "").trim().toLowerCase();
    const list = [a, b].filter(Boolean).sort();
    return list.length === 2 ? `${list[0]}__${list[1]}` : `${a || "unknown"}__${b || "unknown"}`;
  }

  function loadMessages(key) {
    const raw = localStorage.getItem(LS_CHAT_PREFIX + key);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveMessages(key, messages) {
    localStorage.setItem(LS_CHAT_PREFIX + key, JSON.stringify(messages ?? []));
  }

  function addMessage({ fromEmail, toEmail, text, ts }) {
    const key = conversationKey(fromEmail, toEmail);
    const messages = loadMessages(key);
    const msg = {
      id:
        crypto && crypto.randomUUID
          ? crypto.randomUUID()
          : String(Date.now()) + "_" + Math.random().toString(16).slice(2),
      fromEmail: String(fromEmail || ""),
      toEmail: String(toEmail || ""),
      text: String(text || ""),
      ts: ts ?? new Date().toISOString(),
    };
    messages.push(msg);
    saveMessages(key, messages);
    return msg;
  }

  window.ZINAS = {
    conversationKey,
    loadMessages,
    saveMessages,
    addMessage,
  };
})();

