import { Fragment, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

// Minimal, safe markdown for assistant answers: paragraphs, lists, bold/italic, code, links,
// blockquotes, simple tables and <sub>. No HTML is injected.

function inline(text: string, key = 0): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\)|_[^_]+_|\*[^*]+\*|<sub>.*?<\/sub>)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = `${key}-${i++}`;
    if (t.startsWith('**')) out.push(<strong key={k} className="font-semibold text-ink">{inline(t.slice(2, -2), i)}</strong>);
    else if (t.startsWith('`')) out.push(<code key={k}>{t.slice(1, -1)}</code>);
    else if (t.startsWith('[')) {
      const [, label, href] = t.match(/\[([^\]]+)\]\(([^)]+)\)/)!;
      out.push(href.startsWith('/') ? <Link key={k} to={href}>{label}</Link> : <a key={k} href={href} target="_blank" rel="noreferrer">{label}</a>);
    } else if (t.startsWith('<sub>')) out.push(<sub key={k} className="block pt-1">{t.slice(5, -6)}</sub>);
    else out.push(<em key={k}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      blocks.push(<div key={i} className={h[1].length <= 1 ? 'mt-3 mb-1 text-[14px] font-semibold text-ink' : 'mt-3 mb-1 text-[13px] font-semibold text-ink'}>{inline(h[2], i)}</div>);
      i++;
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) { blocks.push(<hr key={i} className="my-3 border-line" />); i++; continue; }
    if (/^\s*\d+[.)] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+[.)] /.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+[.)] /, ''));
      blocks.push(<ol key={i} className="my-1.5 list-decimal pl-5">{items.map((t, j) => <li key={j}>{inline(t, j)}</li>)}</ol>);
      continue;
    }
    if (/^\s*[-*] /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*] /.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*] /, ''));
      blocks.push(<ul key={i}>{items.map((t, j) => <li key={j}>{inline(t, j)}</li>)}</ul>);
      continue;
    }
    if (line.startsWith('>')) {
      const q: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) q.push(lines[i++].replace(/^>\s?/, ''));
      blocks.push(<blockquote key={i}>{inline(q.join(' '))}</blockquote>);
      continue;
    }
    if (line.startsWith('|')) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith('|')) {
        const cells = lines[i++].split('|').slice(1, -1).map((c) => c.trim());
        if (!cells.every((c) => /^-+$/.test(c))) rows.push(cells);
      }
      blocks.push(
        <table key={i}><tbody>{rows.map((r, ri) => <tr key={ri}>{r.map((c, ci) => (ri === 0 ? <th key={ci}>{inline(c)}</th> : <td key={ci}>{inline(c)}</td>))}</tr>)}</tbody></table>,
      );
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(\s*[-*] |\s*\d+[.)] |>|\||#{1,4}\s|-{3,}$)/.test(lines[i])) para.push(lines[i++]);
    if (!para.length) para.push(lines[i++]);
    blocks.push(<p key={i}>{para.map((p, j) => <Fragment key={j}>{j > 0 && <br />}{inline(p, j)}</Fragment>)}</p>);
  }
  return <div className="prose-chat">{blocks}</div>;
}
