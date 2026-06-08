import { memo } from 'react';
import { getBezierPath, type EdgeProps } from '@xyflow/react';

// Органичное ребро-ветвь: плавная кривая Безье, окрашенная цветом ветки и
// сужающаяся вглубь дерева (толще у корня). Wave C.

interface BranchEdgeData {
  color?: string;
  depth?: number;
  [key: string]: unknown;
}

function BranchEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data
}: EdgeProps): JSX.Element {
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    curvature: 0.5
  });

  const d = data as BranchEdgeData | undefined;
  const depth = d?.depth ?? 1;
  const width = Math.max(1.5, 3.6 - (depth - 1) * 0.6);

  return (
    <path
      d={path}
      className="mind-edge"
      fill="none"
      stroke={d?.color ?? 'var(--color-border)'}
      strokeWidth={width}
      strokeLinecap="round"
    />
  );
}

export default memo(BranchEdge);
