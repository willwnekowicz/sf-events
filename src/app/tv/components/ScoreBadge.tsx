interface ScoreBadgeProps {
  score: number;
}

export function ScoreBadge({ score }: ScoreBadgeProps) {
  let colorClass = "bg-red-500 text-white";
  if (score >= 80) colorClass = "bg-green-500 text-black";
  else if (score >= 60) colorClass = "bg-blue-500 text-white";
  else if (score >= 40) colorClass = "bg-yellow-500 text-black";

  return (
    <span className={`${colorClass} text-xs font-bold px-2 py-0.5 rounded`}>
      {score}
    </span>
  );
}
