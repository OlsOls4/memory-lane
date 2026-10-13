import type { Metadata } from "next";

export const metadata: Metadata = { title: "Memory Lane for AI agents (MCP)" };

const URL = "https://memory-lane-nemotron-nebius.vercel.app/api/mcp";

export default function Agents() {
  return (
    <>
      <section className="intro" aria-labelledby="agents-h">
        <h1 id="agents-h">Use Memory Lane inside your AI assistant.</h1>
        <p className="lead">
          Memory Lane is also an MCP server. Add it to Claude, ChatGPT, Cursor or your own agent, and it can plan
          era-matched reminiscence activities from Qloo’s taste graph in the middle of a conversation.
        </p>
      </section>
      <section className="sheet sheet-pad agents" aria-label="How to connect">
        <h2>Server address</h2>
        <pre className="code">{URL}</pre>
        <p className="muted small">Streamable HTTP, no sign-in. Residents’ names are never sent to Qloo, and nothing is stored.</p>

        <h2>Tools</h2>
        <ul className="tool-list">
          <li>
            <code>plan_reminiscence_week</code>
            <span>A printable 7-day plan for one resident: songs, films, TV, a taste of home, armchair travel, a read-aloud and a sing-along, each with a reason from Qloo.</span>
          </li>
          <li>
            <code>plan_group_session</code>
            <span>A 45-minute session for 2 to 6 residents, built on the tastes Qloo’s compare analysis says they share.</span>
          </li>
          <li>
            <code>reminiscence_years</code>
            <span>The years someone is most likely to remember, from when they were born.</span>
          </li>
        </ul>

        <h2>Claude</h2>
        <p>Settings → Connectors → Add custom connector, then paste the server address.</p>
        <h2>Claude Desktop, Cursor and other MCP clients</h2>
        <pre className="code">{`{
  "mcpServers": {
    "memory-lane": { "url": "${URL}" }
  }
}`}</pre>
        <h2>Try asking</h2>
        <p className="quote">“My nan was born in 1938 in Glasgow and loved Lulu. Plan her a week of activities for the care home.”</p>
        <h2>Test it from a terminal</h2>
        <pre className="code">{`curl -s ${URL} -H 'Content-Type: application/json' \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"reminiscence_years","arguments":{"born":"1942"}}}'`}</pre>
      </section>
    </>
  );
}
