// csvreader21 — a faster drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
//
// Same answers as csv-reader 1.0.0 on every input: {columns, rows, errors}.
// Faster because it never walks the text one character at a time: unquoted
// fields are found with bounded indexOf scans and taken as one slice, quoted
// fields are found with indexOf('"') and taken as one slice when they need no
// transformation, and the slow character-wise work only happens inside quoted
// fields that actually contain doubled quotes or carriage returns.
//
// The reading policy (csv-reader's own):
//   - a U+FEFF at the very start is dropped;
//   - a record ends at LF or CRLF, and a line left with no characters is no record;
//   - outside quotes a CR not followed by LF is dropped (stray_cr);
//   - a field that opens with a quote runs to the next quote that is not doubled,
//     "" inside it one quote, each CRLF or lone CR inside it read as LF; what
//     follows its closing quote, up to the next comma or line break, is appended
//     as it stands (quote_junk, when the field ends); a quote that never closes
//     is a literal character, and the text after it is read again as unquoted
//     (unterminated_quote);
//   - a quote inside an unquoted field is a literal character;
//   - columns is the first record when header is true, else null; rows holds the
//     records after it, each padded with "" (short_row) or cut (long_row) to the
//     first record's width;
//   - each error is {code, line, row}, line the 1-based line its record starts on,
//     row its record's index in rows (null for the header), in the order met.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** Count the '\n' characters in a (short) string. */
function countLF(s) {
  let n = 0;
  let p = -1;
  while ((p = s.indexOf('\n', p + 1)) !== -1) n++;
  return n;
}

/** The reading of one CSV input, {text, header}: {columns, rows, errors}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads unquoted characters from pos up to the next comma or line break: a CR
  // not followed by LF is dropped (stray_cr). `init` is the value so far ('' for
  // a fresh field, the quoted value for quote junk). Sets the shared field
  // result (fVal, fEnd, fAdd); `added` counts the characters kept.
  let fVal = '';
  let fEnd = END;
  let fAdd = 0;
  function readUnquoted(init) {
    const ci = text.indexOf(',', pos);
    const ni = text.indexOf('\n', pos);
    let d;
    let ended;
    if (ci !== -1 && (ni === -1 || ci < ni)) {
      d = ci;
      ended = COMMA;
    } else if (ni !== -1) {
      d = ni;
      ended = LINE_BREAK;
    } else {
      d = -1;
      ended = END;
    }
    // The kept segment ends at d, or just before the CR of a CRLF line break.
    let segEnd;
    if (ended === END) segEnd = n;
    else if (ended === COMMA) segEnd = d;
    else segEnd = d > pos && text[d - 1] === '\r' ? d - 1 : d;

    // Take the segment as one slice, then look for stray CRs inside that slice
    // only (never scan past the segment for them).
    const seg = text.slice(pos, segEnd);
    const r = seg.indexOf('\r');
    if (r === -1) {
      fVal = init + seg;
      fAdd = seg.length;
    } else {
      // Stray CRs: drop each (one stray_cr error apiece) and join the pieces.
      const parts = [init];
      let s = 0;
      let kept = 0;
      let rr = r;
      while (rr !== -1) {
        error('stray_cr');
        parts.push(seg.slice(s, rr));
        kept += rr - s;
        s = rr + 1;
        rr = seg.indexOf('\r', s);
      }
      parts.push(seg.slice(s));
      kept += seg.length - s;
      fVal = parts.join('');
      fAdd = kept;
    }
    pos = ended === END ? n : d + 1;
    if (ended === LINE_BREAK) line += 1;
    fEnd = ended;
  }

  // Reads a quoted field's interior (between its opening quote and its closing
  // quote) when it needs transformation: "" becomes one quote and each CRLF or
  // lone CR becomes LF. Counts the line breaks it holds.
  function readQuotedInterior(s, hasDouble) {
    const breaks = s.match(/\r\n?|\n/g);
    if (breaks !== null) line += breaks.length;
    let out = s;
    if (hasDouble) out = out.replace(/""/g, '"');
    if (out.indexOf('\r') !== -1) out = out.replace(/\r\n?/g, '\n');
    return out;
  }

  // Reads a quoted field whose opening quote is at pos. Sets the shared field
  // result (fVal, fEnd, fAdd).
  function readQuoted() {
    const open = pos;
    const openLine = line;
    pos += 1;
    // Find the closing quote: the first quote that is not doubled.
    let q = text.indexOf('"', pos);
    let hasDouble = false;
    let closeQ = -1;
    while (q !== -1) {
      if (text[q + 1] === '"') {
        hasDouble = true;
        q = text.indexOf('"', q + 2);
        continue;
      }
      closeQ = q;
      break;
    }
    if (closeQ === -1) {
      // The quote never closes: it is a literal character, and the text after it
      // is read again as unquoted.
      line = openLine;
      error('unterminated_quote');
      pos = open + 1;
      readUnquoted('"');
      return;
    }
    const interior = text.slice(open + 1, closeQ);
    let value;
    if (!hasDouble && interior.indexOf('\r') === -1) {
      // No transformation needed: one slice, just count its line breaks.
      line += countLF(interior);
      value = interior;
    } else {
      value = readQuotedInterior(interior, hasDouble);
    }
    pos = closeQ + 1;
    if (pos >= n) {
      fVal = value;
      fEnd = END;
      fAdd = 0;
      return;
    }
    const c = text[pos];
    if (c === ',') {
      pos += 1;
      fVal = value;
      fEnd = COMMA;
      fAdd = 0;
      return;
    }
    if (c === '\n') {
      pos += 1;
      line += 1;
      fVal = value;
      fEnd = LINE_BREAK;
      fAdd = 0;
      return;
    }
    if (c === '\r' && text[pos + 1] === '\n') {
      pos += 2;
      line += 1;
      fVal = value;
      fEnd = LINE_BREAK;
      fAdd = 0;
      return;
    }
    // What follows the closing quote is appended as it stands, up to the next
    // comma or line break.
    readUnquoted(value);
    if (fAdd > 0) error('quote_junk');
  }

  // Whole-text fast path: no quotes and no CRs anywhere, so every field is a
  // plain comma-separated slice of its line.
  if (text.indexOf('"', pos) === -1 && text.indexOf('\r', pos) === -1) {
    const lines = text.slice(pos).split('\n');
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (l === '') continue;
      const fields = l.split(',');
      recordLine = i + 1;
      recordRow = header && columns === null ? null : rows.length;
      if (width < 0) width = fields.length;
      if (header && columns === null) {
        columns = fields;
        continue;
      }
      if (fields.length < width) {
        errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
        while (fields.length < width) fields.push('');
      } else if (fields.length > width) {
        errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
      }
      rows.push(fields);
    }
    return { columns: header ? (columns ?? []) : null, rows, errors };
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      if (text[pos] === '\n') {
        pos += 1;
        line += 1;
      } else if (text[pos] === '\r' && text[pos + 1] === '\n') {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let quoted;
    do {
      quoted = text[pos] === '"';
      if (quoted) readQuoted();
      else readUnquoted('');
      fields.push(fVal);
    } while (fEnd === COMMA);

    // A line that held only stray CRs is left with no characters: no record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
