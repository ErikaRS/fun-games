import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { YARN_COLORS } from "./basket-assignment.js";

// Layout is the only phase that knows how yarn colors are displayed.
const YARN_COLOR_BY_HEX = new Map(YARN_COLORS.map((color, i) => [color.hex, { ...color, i }]));

function yarnMeta(color) {
  return YARN_COLOR_BY_HEX.get(color) || { hex: color, name: color, pattern: "solid", i: 0 };
}

function yarnPatternId(color) {
  return `yarn-pattern-${yarnMeta(color).i}`;
}

export function yarnTitle(color) {
  const meta = yarnMeta(color);
  return `${meta.name} yarn (${meta.hex})`;
}

const YARN_PATTERN_CACHE = new Map();

function yarnPatternSpec(pattern) {
  const light = "#fbf3df";
  const dark = "#2a1d10";
  const lightOpacity = pattern.includes("dark") ? 0.25 : 0.42;

  if (pattern === "vertical") {
    return {
      width: 7,
      height: 7,
      markup: `<rect x="0" y="0" width="2" height="7" fill="${light}" opacity="${lightOpacity}" />`,
    };
  }
  if (pattern === "cross") {
    return {
      width: 9,
      height: 9,
      markup: `<path d="M -2 9 L 9 -2 M 2 11 L 11 2 M -2 0 L 9 11 M 2 -2 L 11 7" stroke="${light}" stroke-width="1.7" opacity="${lightOpacity}" />`,
    };
  }
  if (pattern === "horizontal") {
    return {
      width: 7,
      height: 7,
      markup: `<rect x="0" y="0" width="7" height="1.5" fill="${dark}" opacity="0.24" />`,
    };
  }
  if (pattern === "forward" || pattern === "wide-forward") {
    const strokeWidth = pattern === "wide-forward" ? 3 : 2;
    return {
      width: 8,
      height: 8,
      markup: `<path d="M -2 8 L 8 -2 M 2 10 L 10 2" stroke="${light}" stroke-width="${strokeWidth}" opacity="${lightOpacity}" />`,
    };
  }
  if (pattern === "back" || pattern === "wide-back") {
    const strokeWidth = pattern === "wide-back" ? 3 : 2;
    return {
      width: 8,
      height: 8,
      markup: `<path d="M -2 0 L 8 10 M 2 -2 L 10 6" stroke="${light}" stroke-width="${strokeWidth}" opacity="${lightOpacity}" />`,
    };
  }
  if (pattern === "dots-light" || pattern === "dots-dark") {
    const fill = pattern === "dots-dark" ? dark : light;
    return {
      width: 8,
      height: 8,
      markup: `<circle cx="2" cy="2" r="1.8" fill="${fill}" opacity="${lightOpacity}" />`,
    };
  }
  if (pattern === "grid") {
    return {
      width: 7,
      height: 7,
      markup: `<path d="M 0 0 H 7 M 0 0 V 7" stroke="${light}" stroke-width="1.5" opacity="0.38" />`,
    };
  }
  return { width: 8, height: 8, markup: "" };
}

function yarnPatternDataUrl(pattern) {
  if (YARN_PATTERN_CACHE.has(pattern)) return YARN_PATTERN_CACHE.get(pattern);
  const spec = yarnPatternSpec(pattern);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${spec.width}" height="${spec.height}" viewBox="0 0 ${spec.width} ${spec.height}">${spec.markup}</svg>`;
  const href = `data:image/svg+xml,${encodeURIComponent(svg)}`;
  YARN_PATTERN_CACHE.set(pattern, href);
  return href;
}

export function yarnFillStyle(color) {
  const { pattern } = yarnMeta(color);
  const spec = yarnPatternSpec(pattern);
  const style = { backgroundColor: color };

  if (spec.markup) {
    style.backgroundImage = `url("${yarnPatternDataUrl(pattern)}")`;
    style.backgroundSize = `${spec.width}px ${spec.height}px`;
  }

  return style;
}

// LAYOUT
// ────────────────────────────────────────────────────────────────────────────

export function layoutForest(forest, opts) {
  const { nodes, rootIds } = forest;
  const rootRadius = opts.rootRadius;
  const radialGap = opts.radialGap;
  const minNodeArc = opts.minNodeArc;
  const pos = new Map();
  const angles = new Map();

  const leaves = [];
  const collectLeaves = (id) => {
    const node = nodes[id];
    if (node.children.length === 0) {
      leaves.push(id);
      return;
    }
    node.children.forEach(collectLeaves);
  };

  rootIds.forEach(collectLeaves);

  const leafCount = Math.max(leaves.length, 1);
  leaves.forEach((id, i) => {
    angles.set(id, -Math.PI / 2 + (Math.PI * 2 * i) / leafCount);
  });

  const assignInternalAngles = (id) => {
    const node = nodes[id];
    if (node.children.length === 0) return angles.get(id);

    const childAngles = node.children.map(assignInternalAngles);
    const x = childAngles.reduce((sum, angle) => sum + Math.cos(angle), 0);
    const y = childAngles.reduce((sum, angle) => sum + Math.sin(angle), 0);
    const angle = Math.atan2(y, x);
    angles.set(id, angle);
    return angle;
  };

  rootIds.forEach(assignInternalAngles);

  const byDepth = new Map();
  for (const node of nodes) {
    if (!byDepth.has(node.depth)) byDepth.set(node.depth, []);
    byDepth.get(node.depth).push(node);
  }

  for (const [depth, depthNodes] of byDepth) {
    const count = depthNodes.length;
    const radius = Math.max(rootRadius + depth * radialGap, (count * minNodeArc) / (Math.PI * 2));
    const ordered = [...depthNodes].sort((a, b) => angles.get(a.id) - angles.get(b.id));
    for (let i = 0; i < ordered.length; i++) {
      const node = ordered[i];
      const angle = -Math.PI / 2 + (Math.PI * 2 * i) / count;
      pos.set(node.id, {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      });
    }
  }

  const xs = [...pos.values()].map((p) => p.x);
  const ys = [...pos.values()].map((p) => p.y);
  return {
    pos,
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

function stableUnit(seed) {
  const n = Math.sin(seed * 12.9898) * 43758.5453;
  return n - Math.floor(n);
}

function YarnSvgPatterns() {
  return (
    <>
      {YARN_COLORS.map((color, i) => {
        const id = `yarn-pattern-${i}`;
        const spec = yarnPatternSpec(color.pattern);
        return (
          <pattern
            key={id}
            id={id}
            width={spec.width}
            height={spec.height}
            patternUnits="userSpaceOnUse"
          >
            {spec.markup && (
              <image href={yarnPatternDataUrl(color.pattern)} width={spec.width} height={spec.height} />
            )}
          </pattern>
        );
      })}
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// FOREST RENDERER
// Modes: full debug view (no filter props) OR gameplay (visibleIds, etc.)
// Layout is computed for the WHOLE forest, so positions are stable as
// children get revealed. Edges only render when both endpoints are visible.
// ────────────────────────────────────────────────────────────────────────────

export function ForestSVG({
  forest,
  visibleIds,
  clearedIds,
  onTap,
  tappableIds,
  playableIds,
  stuck,
  pullEvent,
  clearedOrder,
}) {
  const PAD = 76;
  const ROOT_RADIUS = 26;
  const RADIAL_GAP = 68;
  const MIN_NODE_ARC = 60;
  const NODE_R = 24;
  const HOLD_PREVIEW_MS = 240;
  const holdRef = useRef(null);
  const [previewNodeId, setPreviewNodeId] = useState(null);

  const layout = useMemo(
    () =>
      layoutForest(forest, {
        rootRadius: ROOT_RADIUS,
        radialGap: RADIAL_GAP,
        minNodeArc: MIN_NODE_ARC,
      }),
    [forest]
  );
  const { pos, minX, maxX, minY, maxY } = layout;

  const width = maxX - minX + PAD * 2;
  const height = maxY - minY + PAD * 2;
  const offsetX = -minX + PAD;
  const offsetY = -minY + PAD;

  const showAll = !visibleIds;
  const isVisible = (id) => showAll || visibleIds.has(id);
  const isCleared = (id) => clearedIds && clearedIds.has(id);
  const isTappable = (id) => tappableIds && tappableIds.has(id);
  const isPlayable = (id) => playableIds && playableIds.has(id);
  const pileOrder = useMemo(() => {
    const ids = clearedOrder || [];
    return new Map(ids.map((id, i) => [id, i]));
  }, [clearedOrder]);
  const previewChildIds = useMemo(() => {
    if (showAll || previewNodeId === null) return new Set();
    const node = forest.nodes[previewNodeId];
    return new Set(node ? node.children : []);
  }, [forest, previewNodeId, showAll]);
  const isPreviewChild = (id) => previewChildIds.has(id) && !isVisible(id);
  const isRendered = (id) => isVisible(id) || isPreviewChild(id);

  const clearHold = useCallback(() => {
    if (holdRef.current?.timer) clearTimeout(holdRef.current.timer);
    holdRef.current = null;
    setPreviewNodeId(null);
  }, []);

  useEffect(
    () => () => {
      if (holdRef.current?.timer) clearTimeout(holdRef.current.timer);
    },
    []
  );

  const onNodePointerDown = useCallback(
    (event, nodeId, canTap) => {
      if (!canTap || !onTap) return;
      event.stopPropagation();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      const press = {
        id: nodeId,
        pointerId: event.pointerId,
        previewed: false,
        timer: null,
      };
      press.timer = setTimeout(() => {
        press.previewed = true;
        setPreviewNodeId(nodeId);
      }, HOLD_PREVIEW_MS);
      holdRef.current = press;
    },
    [onTap]
  );

  const onNodePointerUp = useCallback(
    (event, nodeId) => {
      const press = holdRef.current;
      if (!press || press.id !== nodeId || press.pointerId !== event.pointerId) return;
      event.stopPropagation();
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      if (press.timer) clearTimeout(press.timer);
      holdRef.current = null;
      setPreviewNodeId(null);
      if (!press.previewed) onTap?.(nodeId);
    },
    [onTap]
  );

  const onNodePointerCancel = useCallback(
    (event, nodeId) => {
      const press = holdRef.current;
      if (!press || press.id !== nodeId || press.pointerId !== event.pointerId) return;
      event.stopPropagation();
      event.currentTarget.releasePointerCapture?.(event.pointerId);
      clearHold();
    },
    [clearHold]
  );

  const edgePathBetween = (ax, ay, bx, by) => {
    const dx = bx - ax;
    const dy = by - ay;
    const c1x = ax + dx * 0.55;
    const c1y = ay + dy * 0.15;
    const c2x = bx - dx * 0.15;
    const c2y = by - dy * 0.55;
    return `M ${ax} ${ay} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${bx} ${by}`;
  };

  const edgePath = (e) => edgePathBetween(e.ax, e.ay, e.bx, e.by);

  const nodePoint = (nodeId) => {
    const p = pos.get(nodeId);
    if (!p) return null;

    const node = forest.nodes[nodeId];
    if (!showAll && node?.parentId === null) {
      const rootIndex = forest.rootIds.indexOf(nodeId);
      const count = Math.max(forest.rootIds.length, 1);
      const section = (Math.PI * 2) / count;
      const angleJitter = (stableUnit(nodeId + 17) - 0.5) * section * 0.42;
      const radiusJitter = (stableUnit(nodeId + 41) - 0.5) * 16;
      const minRadiusForClearance =
        count > 1 ? (NODE_R * 2 + 16) / (2 * Math.sin(Math.PI / count)) : 0;
      const angle = -Math.PI / 2 + section * rootIndex + section / 2 + angleJitter;
      const radius = Math.max(74, minRadiusForClearance) + radiusJitter;
      return {
        x: offsetX + Math.cos(angle) * radius,
        y: offsetY + Math.sin(angle) * radius * 0.9,
      };
    }

    return { x: p.x + offsetX, y: p.y + offsetY };
  };

  const pileAvoidRadius = showAll
    ? 0
    : Math.min(82, 38 + Math.sqrt(Math.max(0, pileOrder.size)) * 4.5);

  const baseActiveNodePoint = (nodeId) => {
    const p = nodePoint(nodeId);
    if (!p || showAll || pileAvoidRadius <= 0) return p;

    const dx = p.x - offsetX;
    const dy = p.y - offsetY;
    const distance = Math.hypot(dx, dy);
    if (distance >= pileAvoidRadius) return p;

    const node = forest.nodes[nodeId];
    const angle =
      distance > 0.1
        ? Math.atan2(dy, dx)
        : -Math.PI / 2 + ((node?.id || 0) * 2.399963229728653) % (Math.PI * 2);
    const ringNudge = (node?.depth || 0) * 4 + ((node?.id || 0) % 5) * 1.8;
    const radius = pileAvoidRadius + ringNudge;

    return {
      x: offsetX + Math.cos(angle) * radius,
      y: offsetY + Math.sin(angle) * radius,
    };
  };

  const preferredActiveNodePoint = (nodeId, basePoints) => {
    const base = basePoints.get(nodeId);
    const node = forest.nodes[nodeId];
    if (!base || showAll || !node || node.parentId === null || !isCleared(node.parentId)) return base;

    const parentPoint = basePoints.get(node.parentId) || baseActiveNodePoint(node.parentId);
    if (!parentPoint) return base;

    const siblings = forest.nodes[node.parentId].children.filter((id) => isRendered(id) && !isCleared(id));
    const siblingIndex = Math.max(0, siblings.indexOf(nodeId));
    const siblingCount = Math.max(1, siblings.length);
    if (siblingCount === 1) {
      return {
        x: parentPoint.x + (base.x - parentPoint.x) * 0.08,
        y: parentPoint.y + (base.y - parentPoint.y) * 0.08,
      };
    }

    const parentAngle = Math.atan2(parentPoint.y - offsetY, parentPoint.x - offsetX);
    const arc = Math.min(Math.PI * 0.62, 0.34 + siblingCount * 0.18);
    const angle =
      parentAngle - arc / 2 + (arc * siblingIndex) / Math.max(1, siblingCount - 1);
    const radius = NODE_R + 7 + Math.max(0, siblingCount - 2) * 2;
    return {
      x: parentPoint.x + Math.cos(angle) * radius,
      y: parentPoint.y + Math.sin(angle) * radius,
    };
  };

  const firstCollisionFreePoint = (preferred, placedPoints, clearance, centerClearance, seed) => {
    const isOpen = (point) => {
      if (Math.hypot(point.x - offsetX, point.y - offsetY) < centerClearance) return false;
      return placedPoints.every((other) => Math.hypot(point.x - other.x, point.y - other.y) >= clearance);
    };

    if (isOpen(preferred)) return preferred;

    const startAngle = stableUnit(seed + 101) * Math.PI * 2;
    for (const radius of [8, 16, 25, 36, 50, 66, 84, 106]) {
      const steps = Math.max(8, Math.ceil((Math.PI * 2 * radius) / clearance) + 2);
      for (let i = 0; i < steps; i++) {
        const angle = startAngle + (Math.PI * 2 * i) / steps;
        const point = {
          x: preferred.x + Math.cos(angle) * radius,
          y: preferred.y + Math.sin(angle) * radius,
        };
        if (isOpen(point)) return point;
      }
    }

    const awayAngle = Math.atan2(preferred.y - offsetY, preferred.x - offsetX);
    return {
      x: offsetX + Math.cos(awayAngle) * (centerClearance + clearance),
      y: offsetY + Math.sin(awayAngle) * (centerClearance + clearance),
    };
  };

  const pilePoint = (nodeId) => {
    const index = pileOrder.get(nodeId);
    if (index === undefined) return null;
    if (index === 0) {
      return {
        x: offsetX,
        y: offsetY + 12,
      };
    }

    const row = Math.floor((Math.sqrt(8 * index + 1) - 1) / 2);
    const rowStart = (row * (row + 1)) / 2;
    const slot = index - rowStart;
    const slots = row + 1;
    const spacing = NODE_R * 0.84;
    const x = (slot - (slots - 1) / 2) * spacing;
    const y = 12 + row * (NODE_R * 0.46);
    return {
      x: offsetX + x,
      y: offsetY + y,
    };
  };

  const activePointMap = new Map();
  if (!showAll) {
    const activeNodeIds = forest.nodes
      .filter((node) => isRendered(node.id) && !isCleared(node.id))
      .map((node) => node.id);
    const allRelevantNodeIds = [...new Set([...activeNodeIds, ...activeNodeIds.map((id) => forest.nodes[id]?.parentId).filter((id) => id !== null && id !== undefined)])];
    const basePoints = new Map(
      allRelevantNodeIds
        .map((id) => [id, baseActiveNodePoint(id)])
        .filter(([, point]) => point)
    );
    const clearance = NODE_R * 2 + 8;
    const centerClearance = pileAvoidRadius + NODE_R + 3;
    const preferredPoints = new Map(
      activeNodeIds
        .map((id) => [id, preferredActiveNodePoint(id, basePoints)])
        .filter(([, point]) => point)
    );
    const orderedNodeIds = [...activeNodeIds].sort((a, b) => {
      const ap = preferredPoints.get(a);
      const bp = preferredPoints.get(b);
      const ad = ap ? Math.hypot(ap.x - offsetX, ap.y - offsetY) : 0;
      const bd = bp ? Math.hypot(bp.x - offsetX, bp.y - offsetY) : 0;
      return ad - bd || forest.nodes[a].depth - forest.nodes[b].depth || a - b;
    });
    const placedPoints = [];

    for (const nodeId of orderedNodeIds) {
      const preferred = preferredPoints.get(nodeId);
      if (!preferred) continue;
      const point = firstCollisionFreePoint(
        preferred,
        placedPoints,
        clearance,
        centerClearance,
        nodeId
      );
      activePointMap.set(nodeId, point);
      placedPoints.push(point);
    }
  }

  const activeNodePoint = (nodeId) => {
    if (!showAll && activePointMap.has(nodeId)) return activePointMap.get(nodeId);
    return baseActiveNodePoint(nodeId);
  };

  const displayedNodePoint = (nodeId) => {
    if (!showAll && isCleared(nodeId)) return pilePoint(nodeId) || nodePoint(nodeId);
    return activeNodePoint(nodeId);
  };

  const pullTargetPoint = (node) => {
    const pile = pilePoint(node.id);
    if (pile) return pile;
    return {
      x: offsetX,
      y: offsetY,
    };
  };

  const pullSourcePoint = pullEvent ? activeNodePoint(pullEvent.nodeId) : null;
  const pullNode = pullEvent ? forest.nodes[pullEvent.nodeId] : null;
  const pullTarget = pullNode ? pullTargetPoint(pullNode) : null;

  const pullForNode = (node, cx, cy) => {
    if (!pullEvent || !pullSourcePoint || !pullTarget || node.id === pullEvent.nodeId) {
      return null;
    }

    let toX = pullTarget.x;
    let toY = pullTarget.y;
    let strength = 0;

    if (node.parentId === pullEvent.nodeId) {
      toX = pullSourcePoint.x;
      toY = pullSourcePoint.y;
      strength = 0.18;
    } else if (pullNode && node.parentId === pullNode.parentId) {
      strength = 0.08;
    } else {
      const distance = Math.hypot(cx - pullSourcePoint.x, cy - pullSourcePoint.y);
      strength = Math.max(0, 0.09 - distance / 2600);
    }

    if (strength <= 0.01) return null;

    const dx = toX - cx;
    const dy = toY - cy;
    const len = Math.max(1, Math.hypot(dx, dy));
    const amount = Math.min(node.parentId === pullEvent.nodeId ? 18 : 10, len * strength);
    const tugX = (dx / len) * amount;
    const tugY = (dy / len) * amount;

    return {
      x: tugX,
      y: tugY,
      backX: tugX * -0.16,
      backY: tugY * -0.16,
    };
  };

  const edges = [];
  for (const node of forest.nodes) {
    if (node.parentId === null) continue;
    if (!isRendered(node.id) || !isRendered(node.parentId)) continue;
    const a = displayedNodePoint(node.parentId);
    const b = displayedNodePoint(node.id);
    if (!a || !b) continue;
    const preview = previewChildIds.has(node.id) && node.parentId === previewNodeId;
    edges.push({
      key: node.id,
      ax: a.x,
      ay: a.y,
      bx: b.x,
      by: b.y,
      parentColor: forest.nodes[node.parentId].color,
      childColor: node.color,
      cleared: isCleared(node.id) || isCleared(node.parentId),
      preview,
    });
  }

  const rootYarnEdges = [];
  if (!showAll) {
    const renderedRoots = forest.rootIds
      .filter((id) => isRendered(id))
      .map((id) => ({ id, point: displayedNodePoint(id), node: forest.nodes[id] }))
      .filter((root) => root.point);

    const edgeCount = renderedRoots.length === 2 ? 1 : renderedRoots.length;
    for (let i = 0; i < edgeCount; i++) {
      const a = renderedRoots[i];
      const b = renderedRoots[(i + 1) % renderedRoots.length];
      if (!a || !b || a.id === b.id) continue;
      rootYarnEdges.push({
        key: `root-${a.id}-${b.id}`,
        ax: a.point.x,
        ay: a.point.y,
        bx: b.point.x,
        by: b.point.y,
        parentColor: a.node.color,
        childColor: b.node.color,
        cleared: isCleared(a.id) || isCleared(b.id),
        preview: false,
        fakeRoot: true,
      });
    }
  }

  const renderNode = (n) => {
    if (!isRendered(n.id)) return null;
    const originalPoint = activeNodePoint(n.id);
    const displayPoint = displayedNodePoint(n.id);
    if (!originalPoint || !displayPoint) return null;
    const cx = displayPoint.x;
    const cy = displayPoint.y;
    const cleared = isCleared(n.id);
    const piled = !showAll && cleared;
    const enteringPile = piled && pullEvent?.nodeId === n.id;
    const tappable = isTappable(n.id);
    const playable = isPlayable(n.id);
    const previewChild = isPreviewChild(n.id);
    const pressPreviewing = previewNodeId === n.id;
    const pull = pullForNode(n, cx, cy);
    const pileEntryPath =
      enteringPile && n.parentId !== null
        ? edgePathBetween(
            originalPoint.x - cx,
            originalPoint.y - cy,
            (displayedNodePoint(n.parentId)?.x || originalPoint.x) - cx,
            (displayedNodePoint(n.parentId)?.y || originalPoint.y) - cy
          ) + ` S ${-(originalPoint.x - cx) * 0.08} ${-(originalPoint.y - cy) * 0.08}, 0 0`
        : enteringPile
          ? edgePathBetween(originalPoint.x - cx, originalPoint.y - cy, 0, 0)
          : null;
    const artClassNames = [
      pull ? "yp-node-tug" : "",
      enteringPile ? "yp-pile-enter" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <g
        key={n.id}
        data-yarn-node="true"
        transform={`translate(${cx}, ${cy})`}
        style={{
          cursor: tappable && onTap ? "pointer" : "default",
          opacity: previewChild ? 0.82 : stuck && !playable ? 0.52 : 1,
          transition: "opacity 280ms ease",
          pointerEvents: piled ? "none" : "auto",
        }}
        onPointerDown={(event) => onNodePointerDown(event, n.id, tappable && !cleared)}
        onPointerUp={(event) => onNodePointerUp(event, n.id)}
        onPointerCancel={(event) => onNodePointerCancel(event, n.id)}
      >
        <g
          key={`node-art-${n.id}-${pull || enteringPile ? pullEvent.key : "still"}`}
          className={artClassNames || undefined}
          style={
            pull || enteringPile
              ? {
                  ...(pull
                    ? {
                        "--yp-tug-x": `${pull.x}px`,
                        "--yp-tug-y": `${pull.y}px`,
                        "--yp-tug-back-x": `${pull.backX}px`,
                        "--yp-tug-back-y": `${pull.backY}px`,
                      }
                    : {}),
                }
              : undefined
          }
        >
          {pileEntryPath && (
            <animateMotion
              dur="560ms"
              path={pileEntryPath}
              fill="freeze"
              calcMode="spline"
              keyPoints="0;0.86;1"
              keyTimes="0;0.78;1"
              keySplines="0.22 0.82 0.24 1;0.22 1 0.36 1"
            />
          )}
          <title>{`node ${n.id}: ${yarnTitle(n.color)}`}</title>
          {!cleared && !previewChild && (
            <circle
              r={NODE_R + 2}
              fill="#3b2a1a"
              opacity="0.2"
              filter="url(#paper-shadow)"
              transform="translate(1, 2)"
            />
          )}
          {pressPreviewing && !cleared && (
            <circle
              r={NODE_R + 12}
              fill="none"
              stroke="#2a1d10"
              strokeWidth="2"
              strokeDasharray="5 6"
              strokeOpacity="0.42"
            />
          )}
          {playable && !cleared && !previewChild && (
            <circle
              className="yp-pulse"
              r={NODE_R + 9}
              fill="none"
              stroke={n.color}
              strokeWidth="2.4"
              strokeOpacity="0.55"
            />
          )}
          {stuck && tappable && !cleared && !previewChild && (
            <circle
              className="yp-stuck-ring"
              r={NODE_R + 8}
              fill="none"
              stroke="#2a1d10"
              strokeWidth="2"
              strokeOpacity="0.42"
            />
          )}
          {previewChild && (
            <circle
              r={NODE_R + 5}
              fill="#fbf3df"
              stroke="#2a1d10"
              strokeWidth="1.8"
              strokeDasharray="5 5"
              opacity="0.88"
            />
          )}
          <circle
            r={NODE_R}
            fill={n.color || "#dba66a"}
            stroke={piled ? "#fbf3df" : previewChild ? "#2a1d10" : "#3b2a1a"}
            strokeWidth={piled ? "2.8" : previewChild ? "1.6" : "2"}
          />
          <circle
            r={NODE_R - 2}
            fill={`url(#${yarnPatternId(n.color)})`}
            opacity={piled ? "0.42" : "1"}
          />
          {piled && <circle r={NODE_R - 3} fill="#fbf3df" opacity="0.32" />}
          {tappable && <circle r={NODE_R + 18} fill="transparent" />}
        </g>
      </g>
    );
  };

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{
        width: `max(100%, ${width}px)`,
        height: "auto",
        display: "block",
        touchAction: "manipulation",
      }}
      preserveAspectRatio="xMidYMin meet"
    >
      <defs>
        <filter id="paper-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.2" />
        </filter>
        <pattern id="grain" width="3" height="3" patternUnits="userSpaceOnUse">
          <rect width="3" height="3" fill="transparent" />
          <circle cx="1" cy="1" r="0.3" fill="#3b2a1a" opacity="0.06" />
        </pattern>
        <YarnSvgPatterns />
      </defs>

      <rect x="0" y="0" width={width} height={height} fill="url(#grain)" />

      <g fill="none" strokeLinecap="round">
        {[...rootYarnEdges, ...edges].map((e) => (
          <g key={e.key}>
            <path
              d={edgePath(e)}
              stroke="#2a1d10"
              strokeWidth={e.preview ? "1.4" : "9.6"}
              strokeDasharray={e.preview ? "4 6" : undefined}
              strokeOpacity={e.preview ? 0.18 : e.cleared ? 0.07 : 0.18}
            />
            {!e.preview && (
              <>
                <path
                  d={edgePath(e)}
                  stroke={e.parentColor || "#7a5a3a"}
                  strokeWidth={e.fakeRoot ? "6" : "6.4"}
                  strokeDasharray="10 10"
                  strokeDashoffset="0"
                  strokeOpacity={e.cleared ? 0.74 : 1}
                />
                <path
                  d={edgePath(e)}
                  stroke={e.childColor || "#7a5a3a"}
                  strokeWidth={e.fakeRoot ? "6" : "6.4"}
                  strokeDasharray="10 10"
                  strokeDashoffset="10"
                  strokeOpacity={e.cleared ? 0.74 : 1}
                />
              </>
            )}
            {e.preview && (
              <path
                d={edgePath(e)}
                stroke="#7a5a3a"
                strokeWidth="1.25"
                strokeDasharray="4 6"
                strokeOpacity="0.34"
              />
            )}
          </g>
        ))}
      </g>

      <g>
        {forest.nodes
          .filter((n) => isRendered(n.id) && (isCleared(n.id) || isPreviewChild(n.id)))
          .map(renderNode)}
      </g>

      <g>
        {forest.nodes
          .filter((n) => isRendered(n.id) && !isCleared(n.id) && !isPreviewChild(n.id))
          .map(renderNode)}
      </g>

    </svg>
  );
}

// ────────────────────────────────────────────────────────────────────────────
