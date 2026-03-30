(function () {
  function norm(v) {
    return String(v ?? "")
      .toLowerCase()
      .trim();
  }

  function includesMatch(value, query) {
    const q = norm(query);
    if (!q) return true;
    const v = norm(value);
    return v.includes(q);
  }

  function anyActive(filters) {
    return Object.values(filters ?? {}).some((v) => String(v ?? "").trim() !== "");
  }

  // Public API
  window.PDDFiltr = {
    norm,
    includesMatch,
    anyActive,
  };
})();

