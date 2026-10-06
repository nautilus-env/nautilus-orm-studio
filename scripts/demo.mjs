import { spawn } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
if (args.some((arg) => !["--seed-only", "--reset"].includes(arg))) {
    throw new Error("Usage: npm run demo -- [--seed-only] [--reset]");
}
const { DatabaseSync } = await import("node:sqlite").catch(() => {
    throw new Error("The demo needs Node.js 22.13+ or 24+. Check node --version.");
});
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const directory = join(root, "generated", "demo");
const databasePath = join(directory, "studio-demo.db");
const schemaPath = join(directory, "schema.nautilus");
const tableName = (name) => {
    const snake = name.replace(/[A-Z]/g, (char, index) => `${index ? "_" : ""}${char.toLowerCase()}`);
    return snake.endsWith("y") ? `${snake.slice(0, -1)}ies` : `${snake}${snake.endsWith("s") ? "es" : "s"}`;
};
const models = [];
function add(name, rows, targets = []) {
    const model = { name, rows, table: tableName(name), targets };
    models.push(model);
    return model;
}
const organization = add("Organization", 100);
const user = add("User", 5000, [organization]);
add("Team", 500, [organization, user]);
add("Product", 10000, [organization]);
const groups = [
    ["Customer", "Contact", "Address", "Segment", "CustomerNote"],
    ["Order", "OrderItem", "Payment", "Shipment", "Return"],
    ["Project", "Task", "Milestone", "ProjectFile", "TimeEntry"],
    ["Warehouse", "StockLocation", "StockLevel", "StockMovement", "InventoryCount"],
    ["Supplier", "PurchaseOrder", "PurchaseItem", "SupplierInvoice", "SupplierContact"],
    ["Ticket", "TicketMessage", "TicketAttachment", "TicketEvent", "TicketRating"],
    ["Campaign", "Audience", "CampaignMessage", "CampaignEvent", "CampaignMetric"],
    ["Subscription", "SubscriptionPlan", "SubscriptionEvent", "UsageRecord", "SubscriptionInvoice"],
    ["Article", "ArticleRevision", "ArticleComment", "ArticleTag", "ArticleAsset"],
    ["Workflow", "WorkflowStep", "WorkflowRun", "WorkflowEvent", "WorkflowLog"],
    ["Report", "ReportSchedule", "ReportRun", "ReportMetric", "ReportSnapshot"],
    ["Integration", "IntegrationEndpoint", "IntegrationSync", "IntegrationEvent", "IntegrationLog"],
];
for (const names of groups) {
    const parent = add(names[0], names[0] === "Order" ? 50000 : 5000, [organization, user]);
    let previous = user;
    names.slice(1).forEach((name, index) => { previous = add(name, [500, 2000, 1000, 2000][index], [parent, previous]); });
}
const fields = [
    ["id", "Int @id @default(autoincrement())", "INTEGER PRIMARY KEY AUTOINCREMENT"],
    ["name", "String", "TEXT NOT NULL"],
    ["code", "String @unique", "TEXT NOT NULL UNIQUE"],
    ["status", 'String @default("active")', "TEXT NOT NULL DEFAULT 'active'"],
    ["active", "Boolean @default(true)", "BOOLEAN NOT NULL DEFAULT 1"],
    ["amount", "Float?", "REAL"],
    ["notes", "String?", "TEXT"],
    ["metadata", "Json?", "JSON"],
    ["createdAt", "DateTime @default(now())", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP"],
    ["updatedAt", "DateTime @default(now())", "DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP"],
];
const relationField = (target) => `${target.name[0].toLowerCase()}${target.name.slice(1)}`;
const schema = models.map((model) => {
    const columns = fields.map(([name, type]) => `  ${name} ${type}`);
    for (const target of model.targets) {
        const field = relationField(target);
        columns.push(`  ${field}Id Int`, `  ${field} ${target.name} @relation(fields: [${field}Id], references: [id])`);
    }
    for (const child of models.filter((candidate) => candidate.targets.includes(model))) {
        columns.push(`  ${child.table} ${child.name}[]`);
    }
    return `model ${model.name} {\n${columns.join("\n")}\n  @@map("${model.table}")\n}`;
}).join("\n\n");
mkdirSync(directory, { recursive: true });
const fresh = !existsSync(databasePath) || !existsSync(schemaPath) || args.includes("--reset");
const database = new DatabaseSync(databasePath);
try {
    database.exec("PRAGMA foreign_keys = ON");
    if (fresh) {
        console.log("Creating the large demo database...");
        database.exec("BEGIN");
        try {
            for (const model of [...models].reverse()) database.exec(`DROP TABLE IF EXISTS "${model.table}"`);
            for (const model of models) {
                const columns = fields.map(([name, , sql]) => `"${name}" ${sql}`);
                columns.push(...model.targets.map((target) => `"${relationField(target)}Id" INTEGER NOT NULL REFERENCES "${target.table}"(id)`));
                database.exec(`CREATE TABLE "${model.table}" (${columns.join(", ")})`);
                const columnNames = [...fields.map(([name]) => name), ...model.targets.map((target) => `${relationField(target)}Id`)];
                const insert = database.prepare(`INSERT INTO "${model.table}" (${columnNames.map((name) => `"${name}"`).join(", ")}) VALUES (${columnNames.map(() => "?").join(", ")})`);
                for (let id = 1; id <= model.rows; id++) {
                    const date = new Date(Date.UTC(2025, 0, 1) + (id % 365) * 86400000).toISOString();
                    insert.run(id, `${model.name} ${String(id).padStart(6, "0")}`, `${model.table}-${id}`,
                    ["active", "pending", "completed", "archived"][id % 4], id % 5 ? 1 : 0,
                    id % 13 ? ((id * 7919) % 100000) / 100 : null,
                    id % 7 ? `Demo ${model.name}: Milano, Zürich, 東京 · ${id}` : null,
                    id % 11 ? JSON.stringify({ priority: id % 5, tags: ["demo", model.table], region: ["EU", "US", "APAC"][id % 3] }) : null,
                    date, date, ...model.targets.map((target) => (id - 1) % target.rows + 1));
                }
                for (const target of model.targets) {
                    database.exec(`CREATE INDEX "${model.table}_${relationField(target)}" ON "${model.table}"("${relationField(target)}Id")`);
                }
            }
            if (database.prepare("PRAGMA foreign_key_check").all().length) throw new Error("Invalid demo relations");
            database.exec("COMMIT");
        } catch (error) {
            database.exec("ROLLBACK");
            throw error;
        }
    }
    writeFileSync(schemaPath, `datasource db {\n  provider = "sqlite"\n  url = ${JSON.stringify(`sqlite://${databasePath.replaceAll("\\", "/")}?mode=rwc`)}\n}\n\n${schema}\n`);
    const totalRows = models.reduce((sum, model) => sum + Number(database.prepare(`SELECT COUNT(*) AS count FROM "${model.table}"`).get().count), 0);
    console.log(`${models.length} tables · ${models.reduce((sum, model) => sum + model.targets.length, 0)} relations · ${totalRows.toLocaleString("en-US")} rows`);
    console.log(`Database: ${databasePath}\nSchema: ${schemaPath}`);
} finally {
    database.close();
}

if (!args.includes("--seed-only")) {
    console.log("\nDiagram: http://localhost:3001\n1,000 rows: http://localhost:3001/tables/orders?page_size=1000\nSQL: http://localhost:3001/query\nStop: Ctrl+C\n");
    const require = createRequire(import.meta.url);
    const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", "3001"], {
        cwd: root,
        stdio: "inherit",
        windowsHide: true,
        env: { ...process.env, NAUTILUS_SCHEMA_PATH: schemaPath },
    });
    process.on("SIGINT", () => server.kill("SIGINT"));
    process.on("SIGTERM", () => server.kill("SIGTERM"));
    server.on("error", (error) => { console.error(error.message); process.exitCode = 1; });
    server.on("exit", (code) => { process.exitCode = code ?? 0; });
}
