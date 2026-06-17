import type { OperationReport, ReportIssue } from "../domain/operations";

export type GroupedReportIssue = {
  level: string;
  sheet: string;
  message: string;
  count: number;
};

export function groupReportIssues(issues: ReportIssue[]): GroupedReportIssue[] {
  const groups = new Map<string, GroupedReportIssue>();
  for (const issue of issues) {
    const fileName = issue.file
      ?.split(/[/\\]/)
      .pop()
      ?.replace(/\.(plist|png)$/i, "");
    const sheet = fileName && fileName.trim().length > 0 ? fileName : "global";
    const key = `${issue.level}|${sheet}|${issue.message}`;
    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    groups.set(key, {
      level: issue.level,
      sheet,
      message: issue.message,
      count: 1,
    });
  }
  return Array.from(groups.values());
}

function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildIssuesCsv(groupedIssues: GroupedReportIssue[]): string {
  const header = "level,sheet,message,count";
  const rows = groupedIssues.map((issue) =>
    [
      escapeCsvField(issue.level),
      escapeCsvField(issue.sheet),
      escapeCsvField(issue.message),
      String(issue.count),
    ].join(","),
  );
  return [header, ...rows].join("\r\n");
}

export function buildIssuesCsvFromReport(report: OperationReport): string {
  return buildIssuesCsv(groupReportIssues(report.issues));
}

export async function copyTextToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

export function downloadTextFile(
  content: string,
  fileName: string,
  mimeType = "text/csv;charset=utf-8",
): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function issuesCsvFileName(operation: string): string {
  const safeOperation =
    operation.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 48) ||
    "issues";
  const date = new Date().toISOString().slice(0, 10);
  return `${safeOperation}_issues_${date}.csv`;
}
