"""CMS page tree used for slug validation and CMS user access expansion.

CMS user assignments store **main (top-level) slugs only**.
Subpages are never assigned directly; `expand_page_access` grants all descendants.

When adding a page, update this file and `frontend/src/pages/Admin/adminNav.ts`
together (same tree shape).
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class PageNode:
    slug: str
    children: tuple[PageNode, ...] = ()
    has_content: bool = True


# Top-level nodes are the only assignable pages in Settings.
PAGE_TREE: tuple[PageNode, ...] = (
    PageNode("home"),
    PageNode("visit"),
    PageNode("church-history"),
    PageNode("church-vision"),
    PageNode("posts"),
    PageNode("blogger"),
    PageNode("members", has_content=False),
)


def _walk(nodes: tuple[PageNode, ...]):
    for node in nodes:
        yield node
        yield from _walk(node.children)


def all_slugs() -> frozenset[str]:
    return frozenset(node.slug for node in _walk(PAGE_TREE))


def content_slugs() -> frozenset[str]:
    return frozenset(node.slug for node in _walk(PAGE_TREE) if node.has_content)


def assignable_slugs() -> list[str]:
    return [node.slug for node in PAGE_TREE]


def _descendants(node: PageNode) -> frozenset[str]:
    result: set[str] = {node.slug}
    for child in node.children:
        result.update(_descendants(child))
    return frozenset(result)


def _node_by_slug(slug: str) -> PageNode | None:
    for node in _walk(PAGE_TREE):
        if node.slug == slug:
            return node
    return None


def expand_page_access(assigned_pages: list[str]) -> frozenset[str]:
    allowed: set[str] = set()
    for raw in assigned_pages:
        slug = str(raw).strip()
        node = _node_by_slug(slug)
        if node is None:
            continue
        allowed.update(_descendants(node))
    return frozenset(allowed)


def can_access_page(assigned_pages: list[str], slug: str) -> bool:
    return slug in expand_page_access(assigned_pages)


def is_known_slug(slug: str) -> bool:
    return slug in content_slugs()
