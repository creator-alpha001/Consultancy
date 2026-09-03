'use client';

import { useMemo, useState } from 'react';
import { Button, Chip, Divider, Eyebrow, Panel } from '@/components/ui';
import type { ManifestCategory } from '@/lib/data';

/**
 * The category tree, edited.
 *
 * A client component, deliberately, in an app that is otherwise server
 * rendered: rearranging a tree is the one job here that genuinely needs
 * local state. Everything it produces is submitted as one JSON field to
 * a server action, so the publish itself — and the session that
 * authorises it — never leaves the server.
 *
 * The editor works in SLUGS and LABELS, not ids. That is not a
 * simplification: the slug is what the manifest is keyed on and what the
 * sync matches against, so editing a label leaves the category's
 * identity — and every engagement pointing at it — untouched, while
 * changing a slug deliberately creates a new one and retires the old.
 * The diff below says so in as many words, because that distinction is
 * the whole safety story and it is invisible if nobody states it.
 */

interface Node extends ManifestCategory {
  children?: Node[];
}

function slugsOf(nodes: Node[], prefix = ''): string[] {
  return nodes.flatMap((n) => {
    const path = prefix ? `${prefix}/${n.slug}` : n.slug;
    return [path, ...slugsOf(n.children ?? [], path)];
  });
}

function slugify(label: string): string {
  return label.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** Immutably apply `fn` to the node at `path` (indices from the root). */
function editAt(nodes: Node[], path: number[], fn: (n: Node) => Node | null): Node[] {
  const [head, ...rest] = path;
  return nodes.flatMap((n, i) => {
    if (i !== head) return [n];
    if (rest.length === 0) {
      const next = fn(n);
      return next ? [next] : [];
    }
    return [{ ...n, children: editAt(n.children ?? [], rest, fn) }];
  });
}

function moveAt(nodes: Node[], path: number[], delta: number): Node[] {
  const parentPath = path.slice(0, -1);
  const index = path[path.length - 1] as number;
  const swap = (list: Node[]): Node[] => {
    const target = index + delta;
    if (target < 0 || target >= list.length) return list;
    const next = [...list];
    const a = next[index] as Node;
    next[index] = next[target] as Node;
    next[target] = a;
    return next;
  };
  if (parentPath.length === 0) return swap(nodes);
  return editAt(nodes, parentPath, (n) => ({ ...n, children: swap(n.children ?? []) }));
}

export function CategoryEditor({
  domainCode,
  initial,
  languages,
  publish,
}: {
  domainCode: string;
  initial: ManifestCategory[];
  /** The languages this domain works in — a label is offered for each. */
  languages: string[];
  publish: (formData: FormData) => void;
}): JSX.Element {
  const [tree, setTree] = useState<Node[]>(initial as Node[]);
  const [ack, setAck] = useState(false);

  const diff = useMemo(() => {
    const before = new Set(slugsOf(initial as Node[]));
    const after = new Set(slugsOf(tree));
    return {
      added: [...after].filter((s) => !before.has(s)),
      retired: [...before].filter((s) => !after.has(s)),
    };
  }, [initial, tree]);

  const dirty = JSON.stringify(tree) !== JSON.stringify(initial);

  const setLabel = (path: number[], lang: string, value: string): void =>
    setTree((t) => editAt(t, path, (n) => ({ ...n, labels: { ...n.labels, [lang]: value } })));

  const addChild = (path: number[]): void =>
    setTree((t) =>
      editAt(t, path, (n) => ({
        ...n,
        children: [...(n.children ?? []), { slug: `new-${Date.now().toString(36)}`, labels: { en: 'New category' } }],
      })),
    );

  const remove = (path: number[]): void => setTree((t) => editAt(t, path, () => null));

  const renderNodes = (nodes: Node[], parentPath: number[] = []): JSX.Element => (
    <ul className={parentPath.length ? 'mt-2 space-y-2 border-l border-line pl-4' : 'space-y-3'}>
      {nodes.map((node, i) => {
        const path = [...parentPath, i];
        const key = path.join('-');
        // Compared on the full path, because a slug is only unique among
        // its siblings — "essay" under Mains is not "essay" under Prelims.
        const isNew = !slugsOf(initial as Node[]).includes(pathSlug(tree, path));
        return (
          <li key={key} className="rounded-md border border-line bg-surface p-3.5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                {languages.map((lang) => (
                  <label key={lang} className="flex items-center gap-2">
                    <span className="w-8 flex-none text-micro font-semibold uppercase text-ink-muted">{lang}</span>
                    <input
                      value={node.labels[lang] ?? ''}
                      onChange={(e) => setLabel(path, lang, e.target.value)}
                      placeholder={lang === 'en' ? 'Name in English' : `Name in ${lang}`}
                      className="h-9 w-full rounded-md border border-line-strong bg-surface px-2.5 text-small focus:border-brand focus:shadow-focus focus:outline-none"
                    />
                  </label>
                ))}
                <p className="flex flex-wrap items-center gap-2 text-caption text-ink-muted">
                  <span className="figure">{node.slug}</span>
                  {isNew && <Chip tone="info">New</Chip>}
                  {node.skills && node.skills.length > 0 && (
                    <Chip tone="neutral">
                      {node.skills.length} skill{node.skills.length === 1 ? '' : 's'} mapped
                    </Chip>
                  )}
                </p>
              </div>

              <div className="flex flex-none flex-wrap gap-1.5">
                <Button type="button" size="sm" tone="quiet" onClick={() => setTree((t) => moveAt(t, path, -1))}>
                  ↑
                </Button>
                <Button type="button" size="sm" tone="quiet" onClick={() => setTree((t) => moveAt(t, path, 1))}>
                  ↓
                </Button>
                <Button type="button" size="sm" tone="secondary" onClick={() => addChild(path)}>
                  Add under
                </Button>
                <Button type="button" size="sm" tone="destructive" onClick={() => remove(path)}>
                  Retire
                </Button>
              </div>
            </div>
            {node.children && node.children.length > 0 && renderNodes(node.children, path)}
          </li>
        );
      })}
    </ul>
  );

  return (
    <form action={publish} className="space-y-5">
      <input type="hidden" name="domainCode" value={domainCode} />
      <input type="hidden" name="categories" value={JSON.stringify(tree)} />

      <Panel
        title="Categories"
        note="What work in this field is filed under. Matching, search and every rubric hang off this tree."
        action={
          <Button
            type="button"
            size="sm"
            tone="secondary"
            onClick={() =>
              setTree((t) => [...t, { slug: `new-${Date.now().toString(36)}`, labels: { en: 'New category' } }])
            }
          >
            Add a top-level category
          </Button>
        }
      >
        {tree.length === 0 ? (
          <p className="text-body text-ink-muted">
            No categories. A domain with an empty tree can be matched against by nobody — add at least one before
            publishing.
          </p>
        ) : (
          renderNodes(tree)
        )}
      </Panel>

      <Panel title="What this publish will change">
        {!dirty ? (
          <p className="text-body text-ink-muted">Nothing changed yet.</p>
        ) : (
          <div className="space-y-3 text-small">
            {diff.added.length > 0 && (
              <div>
                <Eyebrow>Added</Eyebrow>
                <p className="figure mt-1">{diff.added.join(', ')}</p>
              </div>
            )}
            {diff.retired.length > 0 && (
              <div>
                <Eyebrow>Retired</Eyebrow>
                <p className="figure mt-1">{diff.retired.join(', ')}</p>
                <p className="mt-1.5 text-caption text-ink-muted">
                  Retiring hides a category from matching and search. It is not deleted, and work already filed
                  under it keeps its reference — nothing in flight breaks.
                </p>
              </div>
            )}
            {diff.added.length === 0 && diff.retired.length === 0 && (
              <p className="text-ink-muted">
                Labels only. Every category keeps its identity, so nothing already filed under one is affected.
              </p>
            )}
          </div>
        )}

        {diff.retired.length > 0 && (
          <>
            <Divider className="my-4" />
            <label className="flex cursor-pointer items-start gap-2.5 text-small">
              <input
                type="checkbox"
                name="acknowledgeRetirements"
                checked={ack}
                onChange={(e) => setAck(e.target.checked)}
                className="mt-0.5 h-4 w-4 flex-none accent-[color:var(--brand)]"
              />
              <span>
                I mean to retire {diff.retired.length} categor{diff.retired.length === 1 ? 'y' : 'ies'}.
              </span>
            </label>
          </>
        )}

        <Divider className="my-4" />
        <Button type="submit" size="lg" disabled={!dirty || (diff.retired.length > 0 && !ack)}>
          Publish
        </Button>
        <p className="mt-2 text-caption text-ink-muted">
          Publishing takes effect immediately, with no deploy, for everyone. The previous version is kept.
        </p>
      </Panel>
    </form>
  );
}

/** The slash-path of the node at `path`, matching how the diff keys nodes. */
function pathSlug(nodes: Node[], path: number[]): string {
  const parts: string[] = [];
  let level = nodes;
  for (const index of path) {
    const node = level[index];
    if (!node) break;
    parts.push(node.slug);
    level = node.children ?? [];
  }
  return parts.join('/');
}
