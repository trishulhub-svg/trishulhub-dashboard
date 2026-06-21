"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface TimeSelectProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  allowEndOfDay?: boolean; // If true, includes "24:00" option (for end times)
  className?: string;
}

// Generate 24-hour time options: 00:00, 00:30, 01:00, ..., 23:30, 24:00 (if allowEndOfDay)
function generateTimeOptions(allowEndOfDay: boolean): { value: string; label: string }[] {
  const options: { value: string; label: string }[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 30) {
      const hh = String(h).padStart(2, "0");
      const mm = String(m).padStart(2, "0");
      options.push({ value: `${hh}:${mm}`, label: `${hh}:${mm}` });
    }
  }
  if (allowEndOfDay) {
    options.push({ value: "24:00", label: "24:00 (End of day)" });
  }
  return options;
}

export function TimeSelect({ value, onChange, placeholder = "Select time", allowEndOfDay = false, className }: TimeSelectProps) {
  const options = generateTimeOptions(allowEndOfDay);

  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent className="max-h-[300px]">
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
