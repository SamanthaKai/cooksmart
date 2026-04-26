import jsPDF from "jspdf";

const MARGIN = 18;
const PAGE_W = 210;
const PAGE_H = 297;
const CONTENT_W = PAGE_W - MARGIN * 2;
const GREEN = [76, 133, 78];
const DARK  = [30, 30, 30];
const GRAY  = [120, 120, 120];
const CREAM = [250, 246, 240];

function addPage(doc) {
  doc.addPage();
  return MARGIN;
}

function checkY(doc, y, needed = 10) {
  if (y + needed > PAGE_H - MARGIN) return addPage(doc);
  return y;
}

function wrappedText(doc, text, x, y, maxW, lineH) {
  const lines = doc.splitTextToSize(text, maxW);
  lines.forEach(line => {
    y = checkY(doc, y, lineH + 2);
    doc.text(line, x, y);
    y += lineH;
  });
  return y;
}

export function downloadRecipePDF(recipe, type = "db") {
  const doc = new jsPDF({ unit: "mm", format: "a4" });

  // ── Header ──────────────────────────────────────────────────────────────
  doc.setFillColor(...GREEN);
  doc.rect(0, 0, PAGE_W, 14, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(255, 255, 255);
  doc.text("CookSmart", MARGIN, 9.5);

  const dateStr = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(dateStr, PAGE_W - MARGIN, 9.5, { align: "right" });

  let y = 22;

  // ── Title ────────────────────────────────────────────────────────────────
  const title = type === "ai" ? recipe.dish_name : recipe.name;
  const localName = recipe.local_name;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...DARK);
  const titleLines = doc.splitTextToSize(title || "Recipe", CONTENT_W);
  titleLines.forEach(line => {
    doc.text(line, MARGIN, y);
    y += 9;
  });

  if (localName && localName !== title) {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(12);
    doc.setTextColor(...GRAY);
    doc.text(localName, MARGIN, y);
    y += 7;
  }

  // ── Meta chips ───────────────────────────────────────────────────────────
  y += 2;
  const chips = [];
  if (type === "ai") {
    if (recipe.cuisine)       chips.push(recipe.cuisine);
    if (recipe.cooking_time)  chips.push(`Time: ${recipe.cooking_time}`);
    if (recipe.servings)      chips.push(`Serves: ${recipe.servings}`);
  } else {
    if (recipe.cuisine_type)  chips.push(recipe.cuisine_type);
    if (recipe.course)        chips.push(recipe.course);
    if (recipe.prep_time)     chips.push(`Prep: ${recipe.prep_time}min`);
    if (recipe.cook_time)     chips.push(`Cook: ${recipe.cook_time}min`);
    if (recipe.servings)      chips.push(`Serves: ${recipe.servings}`);
  }

  if (chips.length) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    let chipX = MARGIN;
    chips.forEach(chip => {
      const tw = doc.getTextWidth(chip) + 6;
      if (chipX + tw > PAGE_W - MARGIN) { chipX = MARGIN; y += 7; }
      doc.setFillColor(...CREAM);
      doc.setDrawColor(...GREEN);
      doc.roundedRect(chipX, y - 4, tw, 6, 2, 2, "FD");
      doc.setTextColor(...GREEN);
      doc.text(chip, chipX + 3, y);
      chipX += tw + 4;
    });
    y += 8;
  }

  // ── Divider ──────────────────────────────────────────────────────────────
  doc.setDrawColor(...GREEN);
  doc.setLineWidth(0.4);
  doc.line(MARGIN, y, PAGE_W - MARGIN, y);
  y += 6;

  // ── Description (db recipes only) ────────────────────────────────────────
  if (type === "db" && recipe.description && recipe.description !== "MISSING") {
    doc.setFont("helvetica", "italic");
    doc.setFontSize(10);
    doc.setTextColor(...GRAY);
    y = wrappedText(doc, recipe.description, MARGIN, y, CONTENT_W, 5);
    y += 4;
  }

  // ── Ingredients ──────────────────────────────────────────────────────────
  y = checkY(doc, y, 14);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...GREEN);
  doc.text("Ingredients", MARGIN, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...DARK);

  if (type === "ai") {
    const ings = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
    if (ings.length) {
      ings.forEach(ing => {
        y = checkY(doc, y, 6);
        const qty  = ing.quantity ? ` — ${ing.quantity}` : "";
        const line = `• ${ing.item || ""}${qty}`;
        y = wrappedText(doc, line, MARGIN + 2, y, CONTENT_W - 4, 5);
      });
    } else {
      doc.setTextColor(...GRAY);
      doc.text("No ingredients listed.", MARGIN + 2, y);
      y += 5;
    }
  } else {
    const raw = recipe.ingredients_display || recipe.ingredient_list || "";
    const ings = raw.split("|").map(s => s.trim()).filter(Boolean);
    if (ings.length) {
      ings.forEach(ing => {
        y = checkY(doc, y, 6);
        y = wrappedText(doc, `• ${ing}`, MARGIN + 2, y, CONTENT_W - 4, 5);
      });
    } else {
      doc.setTextColor(...GRAY);
      doc.text("No ingredients listed.", MARGIN + 2, y);
      y += 5;
    }
  }

  y += 5;

  // ── Steps ────────────────────────────────────────────────────────────────
  y = checkY(doc, y, 14);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.setTextColor(...GREEN);
  doc.text("Preparation", MARGIN, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...DARK);

  if (type === "ai") {
    const steps = Array.isArray(recipe.steps) ? recipe.steps : [];
    if (steps.length) {
      steps.forEach((step, i) => {
        y = checkY(doc, y, 8);
        y = wrappedText(doc, `${i + 1}. ${step}`, MARGIN + 2, y, CONTENT_W - 4, 5);
        y += 1;
      });
    } else {
      doc.setTextColor(...GRAY);
      doc.text("No steps available.", MARGIN + 2, y);
      y += 5;
    }
  } else {
    const instructions = recipe.instructions || "";
    const steps = instructions
      .split(/[.]\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 4);
    if (steps.length) {
      steps.forEach((step, i) => {
        y = checkY(doc, y, 8);
        y = wrappedText(doc, `${i + 1}. ${step}`, MARGIN + 2, y, CONTENT_W - 4, 5);
        y += 1;
      });
    } else if (instructions) {
      y = wrappedText(doc, instructions, MARGIN + 2, y, CONTENT_W - 4, 5);
    } else {
      doc.setTextColor(...GRAY);
      doc.text("No instructions available.", MARGIN + 2, y);
      y += 5;
    }
  }

  // ── Health tip / serving suggestion ─────────────────────────────────────
  const tip = type === "ai" ? recipe.health_tip : recipe.serving_suggestion;
  if (tip) {
    y += 4;
    y = checkY(doc, y, 16);
    doc.setFillColor(240, 250, 244);
    doc.setDrawColor(183, 228, 199);
    const tipLines = doc.splitTextToSize(tip, CONTENT_W - 10);
    const boxH = tipLines.length * 5 + 8;
    doc.roundedRect(MARGIN, y - 4, CONTENT_W, boxH, 3, 3, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.setTextColor(...GREEN);
    doc.text(type === "ai" ? "Health Tip" : "Serving suggestion", MARGIN + 4, y + 1);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...DARK);
    y = wrappedText(doc, tip, MARGIN + 4, y, CONTENT_W - 10, 5);
    y += 4;
  }

  // ── Footer on every page ─────────────────────────────────────────────────
  const totalPages = doc.internal.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFillColor(...GREEN);
    doc.rect(0, PAGE_H - 10, PAGE_W, 10, "F");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text("Generated by CookSmart AI", MARGIN, PAGE_H - 4);
    doc.text(`Page ${p} of ${totalPages}`, PAGE_W - MARGIN, PAGE_H - 4, { align: "right" });
  }

  const safeName = (title || "recipe").replace(/[^a-z0-9]/gi, "_").toLowerCase();
  doc.save(`${safeName}.pdf`);
}
