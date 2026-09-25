import { getServerContext } from "@/lib/server-context";
import { can } from "@/lib/auth/rbac";
import { renderStartup } from "@/lib/daemon/spec";
import { StartupEditor } from "./startup-editor";

export const dynamic = "force-dynamic";

export default async function ServerStartupPage({ params }: { params: Promise<{ server: string }> }) {
  const { server: identifier } = await params;
  const { server, access } = await getServerContext(identifier);

  const environment: Record<string, string> = {};
  for (const eggVar of server.egg.variables) environment[eggVar.envVariable] = eggVar.defaultValue;
  for (const value of server.variables) environment[value.variable.envVariable] = value.value;

  const primary = server.allocations.find((a) => a.isPrimary) ?? server.allocations[0];
  environment.SERVER_MEMORY = String(server.memory);
  environment.SERVER_DISK = String(server.disk);
  environment.SERVER_IP = primary?.ip ?? "0.0.0.0";
  environment.SERVER_PORT = String(primary?.port ?? 0);

  const values = new Map(server.variables.map((value) => [value.variableId, value.value]));

  return (
    <StartupEditor
      serverUuid={server.uuidShort}
      canEdit={can(access, "settings.rename")}
      invocation={renderStartup(server.startup, environment)}
      variables={server.egg.variables
        .filter((variable) => variable.userViewable)
        .map((variable) => ({
          id: variable.id,
          name: variable.name,
          description: variable.description,
          envVariable: variable.envVariable,
          value: values.get(variable.id) ?? variable.defaultValue,
          userEditable: variable.userEditable,
        }))}
    />
  );
}
