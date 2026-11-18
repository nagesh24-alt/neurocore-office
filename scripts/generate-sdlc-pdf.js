const fs = require("fs");
const path = require("path");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const root = path.join(__dirname, "..");
const sourcePath = path.join(root, "docs", "SDLC.md");
const outputPath = path.join(root, "docs", "AI-Office-SDLC.pdf");

const markdown = fs.readFileSync(sourcePath, "utf8");

function stripMarkdown(line) {
  return line
    .replace(/^#{1,6}\s*/, "")
    .replace(/^\-\s+/, "• ")
    .replace(/\*\*/g, "")
    .replace(/`/g, "");
}

function wrapText(text, font, size, maxWidth) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";

  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      line = next;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }

  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

async function generate() {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);

  const pageSize = [595.28, 841.89];
  const margin = 48;
  const maxWidth = pageSize[0] - margin * 2;
  const bottom = 48;
  let page = pdf.addPage(pageSize);
  let y = pageSize[1] - margin;
  let pageNumber = 1;
  let inCodeBlock = false;
  let tableMode = false;

  function footer() {
    page.drawText(`AI Office Software SDLC | Page ${pageNumber}`, {
      x: margin,
      y: 24,
      size: 9,
      font: regular,
      color: rgb(0.45, 0.48, 0.55),
    });
  }

  function newPage() {
    footer();
    page = pdf.addPage(pageSize);
    pageNumber += 1;
    y = pageSize[1] - margin;
  }

  function ensure(space) {
    if (y - space < bottom) newPage();
  }

  page.drawText("AI Office Software", {
    x: margin,
    y,
    size: 25,
    font: bold,
    color: rgb(0.08, 0.13, 0.24),
  });
  y -= 31;
  page.drawText("Software Development Life Cycle Structure", {
    x: margin,
    y,
    size: 14,
    font: regular,
    color: rgb(0.26, 0.31, 0.42),
  });
  y -= 30;
  page.drawLine({
    start: { x: margin, y },
    end: { x: pageSize[0] - margin, y },
    thickness: 1,
    color: rgb(0.82, 0.86, 0.92),
  });
  y -= 24;

  const lines = markdown.split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (line.startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      y -= 6;
      continue;
    }

    if (!line.trim()) {
      y -= tableMode ? 4 : 8;
      tableMode = false;
      continue;
    }

    if (line.startsWith("|")) {
      tableMode = true;
      if (/^\|\s*-+/.test(line)) continue;
      const text = stripMarkdown(line)
        .split("|")
        .map(part => part.trim())
        .filter(Boolean)
        .join(" | ");
      const wrapped = wrapText(text, regular, 9.5, maxWidth);
      ensure(wrapped.length * 12 + 3);
      for (const wrappedLine of wrapped) {
        page.drawText(wrappedLine, {
          x: margin,
          y,
          size: 9.5,
          font: regular,
          color: rgb(0.16, 0.2, 0.29),
        });
        y -= 12;
      }
      continue;
    }

    let size = 10.5;
    let font = regular;
    let color = rgb(0.14, 0.17, 0.24);
    let gap = 14;
    let x = margin;
    let text = stripMarkdown(line);

    if (line.startsWith("# ")) {
      size = 19;
      font = bold;
      color = rgb(0.08, 0.13, 0.24);
      gap = 24;
      ensure(38);
    } else if (line.startsWith("## ")) {
      size = 15;
      font = bold;
      color = rgb(0.1, 0.18, 0.34);
      gap = 20;
      ensure(30);
    } else if (line.startsWith("### ")) {
      size = 12;
      font = bold;
      color = rgb(0.12, 0.2, 0.36);
      gap = 17;
      ensure(24);
    } else if (line.startsWith("- ")) {
      x = margin + 12;
      gap = 13;
    } else if (inCodeBlock) {
      size = 9.5;
      font = mono;
      color = rgb(0.19, 0.22, 0.29);
      gap = 12;
      x = margin + 10;
    }

    const wrapped = wrapText(text, font, size, maxWidth - (x - margin));
    ensure(wrapped.length * gap + 4);

    for (const wrappedLine of wrapped) {
      page.drawText(wrappedLine, { x, y, size, font, color });
      y -= gap;
    }

    if (line.startsWith("#") || line.startsWith("##")) y -= 3;
  }

  footer();
  fs.writeFileSync(outputPath, await pdf.save());
  console.log(outputPath);
}

generate().catch(error => {
  console.error(error);
  process.exit(1);
});
