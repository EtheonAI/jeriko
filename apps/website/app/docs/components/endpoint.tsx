interface EndpointProps {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  description: string;
  auth?: boolean;
}

export function Endpoint({ method, path, description, auth }: EndpointProps) {
  return (
    <div className="docs-endpoint">
      <div className="docs-endpoint-header">
        <span className={`docs-badge docs-badge-${method.toLowerCase()}`}>
          {method}
        </span>
        <code className="docs-endpoint-path">{path}</code>
        {auth && <span className="docs-auth-badge">Authenticated</span>}
      </div>
      <p className="docs-endpoint-desc">{description}</p>
    </div>
  );
}
