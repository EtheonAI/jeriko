interface ResponseProps {
  status: number;
  body: string;
}

export function Response({ status, body }: ResponseProps) {
  const color =
    status < 300 ? "var(--brand)" : status < 400 ? "var(--muted)" : "var(--error)";

  return (
    <div className="docs-response">
      <div className="docs-response-header">
        <span className="docs-response-status" style={{ color }}>
          {status}
        </span>
        <span className="docs-response-label">Response</span>
      </div>
      <pre className="docs-code-pre">
        <code>{body}</code>
      </pre>
    </div>
  );
}
