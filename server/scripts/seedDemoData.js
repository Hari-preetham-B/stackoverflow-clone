/**
 * Demo data seeder - SAFE, IDEMPOTENT, TEST DATABASE ONLY.
 *
 * Design rules enforced here:
 *  - Only ever touches accounts whose email is on the @demo.stackoverflowclone.test
 *    domain. Any pre-existing real account (including the legitimate Bronze
 *    subscriber) is never read for update or written.
 *  - Never creates a Payment document. Users who need a Silver/Gold demo tier get
 *    `subscriptionPlan` set as seeded metadata only; there is deliberately NO fake
 *    payment history and NO fake invoice behind them.
 *  - All question / answer / vote / community content is created through the REAL
 *    HTTP API, so reputation accrues through genuine application operations
 *    (+2 question, +5 answer, +10 accepted, +5 at five upvotes, +2 at ten
 *    upvotes, +10 profile completion, -2 downvote, -5 delete, -10 admin remove)
 *    rather than by writing a reputation number.
 *  - Re-running is safe: users are upserted by email and content is skipped when
 *    a question with the same title already exists.
 *
 * Usage:  node scripts/seedDemoData.js        (server must be running on :5000)
 */
import dns from "dns";
dns.setServers(["1.1.1.1"]);

import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/auth.js";
import { createSession, createTrustedDevice } from "../services/securityService.js";

const API = process.env.SEED_API_BASE || "http://localhost:5000";
const DEMO_DOMAIN = "demo.stackoverflowclone.test";
const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD || "DemoPass2024";

// Fake request object so createSession/deviceService can build a real fingerprint.
const reqFor = (userAgent, ip, city) => ({
  headers: { "user-agent": userAgent, "x-forwarded-for": ip, "x-geo-city": city },
  socket: { remoteAddress: ip },
});

async function api(path, { method = "GET", token, body, ua } = {}) {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(ua ? { "User-Agent": ua } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, body: json };
}

// ---------------------------------------------------------------------------
// Demo roster. `plan` is seeded metadata (no payment backing).
// ---------------------------------------------------------------------------
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const FIREFOX = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:126.0) Gecko/20100101 Firefox/126.0";
const SAFARI_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const EDGE = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 Edg/124.0";

const ROSTER = [
  { key: "admin", name: "Demo Admin", email: "admin@demo.stackoverflowclone.test", role: "admin", plan: "gold", rep: 0, lang: "en",
    about: "[DEMO SEED] Platform administrator account used to demonstrate moderation, content removal and the admin login-activity view.",
    tags: ["moderation", "security", "nodejs"], phone: "+919000000001", city: "Bengaluru", ua: CHROME },
  { key: "free", name: "Demo Free User", email: "free@demo.stackoverflowclone.test", role: "user", plan: "free", rep: 0, lang: "en",
    about: "[DEMO SEED] Explorer account on the Free tier, used to show the 1 question/day limit and basic search only.",
    tags: ["html", "css"], phone: "+919000000002", city: "Pune" },
  { key: "bronze", name: "Demo Bronze User", email: "bronze@demo.stackoverflowclone.test", role: "user", plan: "bronze", rep: 0, lang: "en",
    about: "[DEMO SEED] Early-stage developer on the Bronze tier: 5 questions/day, Bronze badge and advanced search.",
    tags: ["javascript", "react"], phone: "+919000000003", city: "Jaipur" },
  { key: "silver", name: "Demo Silver User", email: "silver@demo.stackoverflowclone.test", role: "user", plan: "silver", rep: 0, lang: "es",
    about: "[DEMO SEED] Full-stack engineer on the Silver tier with priority support, enhanced profile visibility and unlimited bookmarks.",
    tags: ["typescript", "nextjs", "postgresql"], phone: "+919000000004", city: "Hyderabad" },
  { key: "gold", name: "Demo Gold User", email: "gold@demo.stackoverflowclone.test", role: "user", plan: "gold", rep: 0, lang: "hi",
    about: "[DEMO SEED] Principal engineer on the Gold tier: unlimited questions, featured profile and the exclusive community.",
    tags: ["java", "spring", "microservices"], phone: "+919000000005", city: "Mumbai" },
  { key: "moderator", name: "Demo Moderator", email: "moderator@demo.stackoverflowclone.test", role: "user", plan: "silver", rep: 0, lang: "fr",
    about: "[DEMO SEED] Community moderator persona. Note: the user schema only allows the roles 'user' and 'admin', so moderation is demonstrated through the admin account.",
    tags: ["community", "writing"], phone: "+919000000006", city: "Lyon" },
  { key: "developer", name: "Demo Developer", email: "developer@demo.stackoverflowclone.test", role: "user", plan: "free", rep: 0, lang: "en",
    about: "[DEMO SEED] Backend developer working mostly in Python and Node.js services.",
    tags: ["python", "nodejs", "mongodb"], phone: "+919000000007", city: "Chennai" },
  { key: "aiml", name: "Demo AI ML User", email: "aiml@demo.stackoverflowclone.test", role: "user", plan: "silver", rep: 0, lang: "en",
    about: "[DEMO SEED] Machine-learning engineer focused on NLP, retrieval and model evaluation.",
    tags: ["python", "pytorch", "nlp", "transformers"], phone: "+919000000008", city: "Bengaluru" },
  { key: "webdev", name: "Demo Web Development User", email: "webdev@demo.stackoverflowclone.test", role: "user", plan: "bronze", rep: 0, lang: "pt",
    about: "[DEMO SEED] Front-end developer building design systems and accessible interfaces.",
    tags: ["react", "css", "accessibility"], phone: "+919000000009", city: "Lisbon" },
  { key: "datasci", name: "Demo Data Science User", email: "datasci@demo.stackoverflowclone.test", role: "user", plan: "gold", rep: 0, lang: "zh",
    about: "[DEMO SEED] Data scientist working on forecasting, experimentation and model monitoring.",
    tags: ["python", "pandas", "spark", "sql"], phone: "+919000000010", city: "Shanghai" },
  { key: "beginner", name: "Demo Beginner", email: "beginner@demo.stackoverflowclone.test", role: "user", plan: "free", rep: 0, lang: "en",
    about: "[DEMO SEED] First-year computer-science student learning Python and data structures.",
    tags: ["python", "datastructures"], phone: "+919000000011", city: "Delhi" },
  { key: "senior", name: "Demo Senior Developer", email: "senior@demo.stackoverflowclone.test", role: "user", plan: "gold", rep: 0, lang: "en",
    about: "[DEMO SEED] Fifteen years across backend and platform engineering; writes a lot about distributed systems.",
    tags: ["distributed-systems", "kafka", "kubernetes", "go"], phone: "+919000000012", city: "Bengaluru" },
  { key: "recruiter", name: "Demo Recruiter", email: "recruiter@demo.stackoverflowclone.test", role: "user", plan: "free", rep: 0, lang: "en",
    about: "[DEMO SEED] Technical recruiter persona used to demonstrate how employers view candidate profiles.",
    tags: ["hiring", "career"], phone: "+919000000013", city: "Gurugram" },
  { key: "u1", name: "Demo User Priya", email: "priya@demo.stackoverflowclone.test", role: "user", plan: "free", rep: 0, lang: "en", about: "[DEMO SEED] Frontend developer contributing to open-source React libraries.", tags: ["react", "testing"], phone: "+919000000014", city: "Kochi" },
  { key: "u2", name: "Demo User Arjun", email: "arjun@demo.stackoverflowclone.test", role: "user", plan: "free", rep: 0, lang: "en", about: "[DEMO SEED] Backend developer working with queues and observability.", tags: ["nodejs", "kafka"], phone: "+919000000015", city: "Ahmedabad" },
  { key: "u3", name: "Demo User Mei", email: "mei@demo.stackoverflowclone.test", role: "user", plan: "free", rep: 0, lang: "en", about: "[DEMO SEED] Computer-science student focused on computer networks.", tags: ["networking", "c"], phone: "+919000000016", city: "Beijing" },
  { key: "u4", name: "Demo User Lucas", email: "lucas@demo.stackoverflowclone.test", role: "user", plan: "free", rep: 0, lang: "en", about: "[DEMO SEED] Systems programmer interested in operating systems and compilers.", tags: ["c", "os", "rust"], phone: "+919000000017", city: "Sao Paulo" },
  { key: "u5", name: "Demo User Sofia", email: "sofia@demo.stackoverflowclone.test", role: "user", plan: "free", rep: 0, lang: "en", about: "[DEMO SEED] Database engineer specialising in query optimisation.", tags: ["sql", "postgresql", "mongodb"], phone: "+919000000018", city: "Madrid" },
  { key: "u6", name: "Demo User Tom", email: "tom@demo.stackoverflowclone.test", role: "user", plan: "free", rep: 0, lang: "en", about: "[DEMO SEED] DevOps engineer automating deployments.", tags: ["docker", "ci"], phone: "+919000000019", city: "Dublin" },
  { key: "u7", name: "Demo User Noor", email: "noor@demo.stackoverflowclone.test", role: "user", plan: "free", rep: 0, lang: "en", about: "[DEMO SEED] Mobile developer shipping React Native apps.", tags: ["react-native", "javascript"], phone: "+919000000020", city: "Karachi" },
];

// Exact-threshold accounts used only to prove the privilege ladder unlocks at
// 50 / 100 / 250 / 500. Their reputation is SEEDED (see README/report): the
// 100-per-day transfer ceiling means a ladder like this cannot be reached
// naturally inside a single test day.
const THRESHOLDS = [
  { key: "t49", name: "Demo Reputation 49", email: "rep49@demo.stackoverflowclone.test", rep: 49 },
  { key: "t50", name: "Demo Reputation 50", email: "rep50@demo.stackoverflowclone.test", rep: 50 },
  { key: "t100", name: "Demo Reputation 100", email: "rep100@demo.stackoverflowclone.test", rep: 100 },
  { key: "t250", name: "Demo Reputation 250", email: "rep250@demo.stackoverflowclone.test", rep: 250 },
  { key: "t500", name: "Demo Reputation 500", email: "rep500@demo.stackoverflowclone.test", rep: 500 },
];

// ---------------------------------------------------------------------------
const QUESTIONS = [
  { by: "gold", t: "Why does my Spring Boot application return 401 even though the JWT is present in the Authorization header?",
    b: "I have a stateless Spring Boot 3 service protected by Spring Security resource server. The token is issued by an external IdP and my filter chain looks like this:\n\n```java\nhttp.authorizeHttpRequests(a -> a\n    .requestMatchers(\"/api/public/**\").permitAll()\n    .anyRequest().authenticated())\n  .oauth2ResourceServer(o -> o.jwt(CustomJwtDecoder.withDefaults()));\n```\n\nThe browser sends `Authorization: Bearer eyJhbGciOi...` and the request still fails with 401 before it reaches my controller. What am I missing?", tags: ["java", "spring-boot", "jwt"] },
  { by: "gold", t: "Understanding the difference between Python's GIL and free-threaded builds in 3.13",
    b: "Python 3.13 shipped an experimental free-threaded build. I understand the classic GIL limits CPU-bound parallelism, but I am struggling to see which workloads actually benefit.\n\nIs the overhead of the free-threaded build significant for I/O-bound services? Should I be measuring with `sys._is_gil_enabled()` before assuming anything?", tags: ["python", "concurrency", "gil"] },
  { by: "gold", t: "MongoDB unique sparse index still rejects documents containing an explicit null",
    b: "I have a schema field that is only populated after a third-party callback completes. Before the callback it is `null`. I declared it as a unique sparse index expecting multiple pending documents to be allowed.\n\n```javascript\ncallbackId: { type: String, default: null, unique: true, sparse: true }\n```\n\nThe first insert succeeds. The second fails with `E11000 duplicate key error collection: app.jobs index: callbackId_1 dup key: { callbackId: null }`. Why does sparse not help here, and what is the right index?", tags: ["mongodb", "mongoose", "index"] },
  { by: "senior", t: "How do I pick a partition key for a high-write time-series collection on MongoDB?",
    b: "We ingest roughly 40k sensor readings per second into a single collection. Documents are `{ deviceId, ts, reading }` and the dominant query is \"all readings for device X in the last hour\".\n\nI understand that a monotonically increasing range shard key creates a hot chunk. Is `{ deviceId: 1, ts: 1 }` correct, or do I need a hashed prefix? How do I measure hotspotting in production without taking the cluster down?", tags: ["mongodb", "sharding", "performance"] },
  { by: "senior", t: "Designing an idempotent Kafka consumer for at-least-once delivery",
    b: "My consumer occasionally processes the same message twice after a rebalance. The downstream write is not idempotent, so users occasionally see duplicated notifications.\n\nI am considering storing processed message keys in MongoDB with a unique index. Is that a reasonable approach at our throughput, or should I be looking at a transactional outbox pattern instead?", tags: ["kafka", "distributed-systems", "architecture"] },
  { by: "senior", t: "When is a circuit breaker worse than a retry policy?",
    b: "We added aggressive retries to a downstream pricing service and effectively caused a retry storm that amplified an incident. A colleague suggested a circuit breaker instead.\n\nIn practice, when is the circuit breaker the right first choice, and how should the states and thresholds be chosen? Does it compose well with retries?", tags: ["microservices", "resilience", "architecture"] },
  { by: "senior", t: "TCP keepalive versus application-level heartbeats for long-lived WebSocket connections",
    b: "Our WebSocket connections sit idle for up to 30 minutes behind a load balancer. Users report connections that appear open on the server but are dead for the client.\n\nIs tuning `SO_KEEPALIVE` sufficient, or should the application send its own ping/pong frames? What interval actually works through typical cloud load balancers?", tags: ["computer-networks", "websockets", "tcp"] },
  { by: "senior", t: "Explaining tail latency to stakeholders who only care about averages",
    b: "Our p50 is 40ms and our p99 is 3.2s. Leadership quotes the average in status meetings and concludes the service is healthy.\n\nHow do you present tail latency convincingly without drowning people in percentiles? Has anyone found a framing that actually changed decisions?", tags: ["performance", "monitoring", "career"] },
  { by: "datasci", t: "Choosing between LightGBM and XGBoost for a tabular classification problem",
    b: "I have roughly 400k rows and 60 features, mostly numeric with some high-cardinality categoricals. Accuracy on a held-out set is the primary metric.\n\nLightGBM gives me slightly better results and trains about 4x faster. What should I be checking before defaulting to LightGBM in production - calibration, memory footprint, or something else?", tags: ["python", "machinelearning", "scikitlearn"] },
  { by: "datasci", t: "How do I prevent training/serving skew in a deployed ranking model?",
    b: "We generate features with Spark offline and with a Python service online. Over time the two implementations have drifted and our offline metrics no longer predict online behaviour.\n\nIs feature-store the only real answer here? What is the smallest change that would have caught this earlier?", tags: ["python", "machinelearning", "dataengineering"] },
  { by: "datasci", t: "Window functions in PostgreSQL: why is my running total wrong after a join?",
    b: "```sql\nSELECT o.id, SUM(p.amount) OVER (PARTITION BY o.customer_id ORDER BY o.created_at)\nFROM orders o JOIN payments p ON p.order_id = o.id;\n```\n\nThe running total includes payments from other orders because the join happens before the window function. What is the cleanest way to compute a per-order running total without repeating the join logic?", tags: ["sql", "postgresql", "databases"] },
  { by: "aiml", t: "Why does my RAG system ignore retrieved context and hallucinate anyway?",
    b: "I have a retrieval step over ~40k documents using an embedding model and pgvector. Retrieval quality looks fine - I inspect the top-k chunks and they are on-topic. The generator still frequently answers from parametric memory.\n\nI have tried lowering temperature to 0 and moving instructions to the end of the prompt. What else systematically improves grounding?", tags: ["python", "nlp", "machinelearning"] },
  { by: "aiml", t: "Evaluating a text classifier without a clean labelled test set",
    b: "I have roughly 6,000 user-reported texts and no gold labels. Manual labelling of 800 examples took two weeks and the agreement between two annotators was only 0.61.\n\nIs weak supervision worth the setup cost here? What would you recommend as a pragmatic first step?", tags: ["python", "nlp", "machinelearning"] },
  { by: "aiml", t: "Tokenizing text containing emoji and mixed scripts for a transformer model",
    b: "My tokenizer produces mostly `[UNK]` for tweets that mix Latin, Devanagari and emoji. I am using a pre-trained BERT checkpoint.\n\nWhat is the right approach - train a custom vocabulary, switch to a multilingual checkpoint, or normalise the text first?", tags: ["nlp", "transformers", "python"] },
  { by: "silver", t: "React 18 StrictMode double-invokes effects - is my cleanup function correct?",
    b: "In development StrictMode mounts, unmounts and remounts components. My effect opens a WebSocket:\n\n```jsx\nuseEffect(() => {\n  const ws = new WebSocket(url);\n  return () => ws.close();\n}, [url]);\n```\n\nI still see duplicate messages in development. Is this expected, or is there something wrong with the cleanup?", tags: ["react", "javascript", "hooks"] },
  { by: "silver", t: "Next.js App Router: when should a route segment be statically generated?",
    b: "I am migrating a dashboard from the pages router. Most routes are behind authentication and change per request, but one marketing page is identical for everyone.\n\nHow do I force a route to be static in the App Router, and how do I confirm from the build output that it actually was?", tags: ["nextjs", "react", "ssr"] },
  { by: "silver", t: "Why does my Express route handler hang when the client disconnects early?",
    b: "A streaming endpoint writes chunks to the response. When the client closes the tab mid-stream, the handler sometimes never finishes and the connection stays open.\n\n```javascript\nrouter.get('/stream', async (req, res) => {\n  for await (const chunk of source()) res.write(chunk);\n  res.end();\n});\n```\n\nWhat is the correct way to detect the abort and tear down the upstream resource?", tags: ["nodejs", "express", "javascript"] },
  { by: "silver", t: "TypeScript: how do I type a discriminated union that is built incrementally?",
    b: "I want a reducer state machine where each event narrows the state. I can type it by hand but the reducer itself stops type-checking once I use a generic helper.\n\nIs there a clean pattern for incrementally building a discriminated union of state transitions without writing out every combination?", tags: ["typescript", "javascript"] },
  { by: "webdev", t: "CSS container queries versus media queries for a reusable card component",
    b: "The same card component is used in a narrow sidebar and a wide main area. Media queries cannot express that because they only know the viewport.\n\nContainer queries solved the layout, but I am unsure how to provide a sensible fallback for older browsers. What is the current baseline?", tags: ["css", "webdevelopment", "responsive"] },
  { by: "webdev", t: "Making a custom select component accessible with a screen reader",
    b: "I built a custom dropdown because the native select cannot be styled to our design system. It passes visual QA but keyboard and screen-reader users are struggling.\n\nWhat ARIA roles and keyboard interactions are the minimum for this to be genuinely accessible?", tags: ["accessibility", "css", "javascript"] },
  { by: "webdev", t: "Why does my React app briefly flash unstyled content on first load?",
    b: "There is a visible flash of unstyled content before the stylesheet loads. The CSS is imported from the component, so I expected it to be bundled and injected automatically.\n\nIs this a font-loading issue, a CSS ordering issue, or something about how the framework injects styles?", tags: ["css", "react", "performance"] },
  { by: "bronze", t: "PostgreSQL query planner ignores my index on a large table",
    b: "The table has about 40 million rows. `EXPLAIN ANALYZE` shows a sequential scan on a filter that should be indexed.\n\n```sql\nSELECT * FROM events WHERE created_at > now() - interval '1 day';\n```\n\nThe index exists on `created_at`. What should I check before assuming the index is broken?", tags: ["sql", "postgresql", "performance"] },
  { by: "bronze", t: "Difference between `git rebase` and `git merge` for a shared branch?",
    b: "I keep breaking the shared `develop` branch with rebase, and a colleague keeps merging. What is the convention teams actually follow for feature branches that live for more than a day?", tags: ["git", "github", "career"] },
  { by: "bronze", t: "Designing a REST API for a resource that is created asynchronously",
    b: "A `POST /exports` call returns immediately but the work takes minutes. What should the response look like so a client can poll correctly?\n\nI have seen `202 Accepted` used, but I am unsure what to put in the body and how the polling endpoint should behave when the job fails.", tags: ["rest-api", "api-design", "architecture"] },
  { by: "bronze", t: "Choosing a data structure for range queries over time series data",
    b: "I need to answer \"all events between t1 and t2 for device X\" with sub-second latency over about 200 million points. The interval pattern is highly skewed - most queries are the last hour.\n\nWould a B-tree still be appropriate, or should I be looking at something else?", tags: ["datastructures", "algorithms", "performance"] },
  { by: "beginner", t: "What is the difference between a stack and a queue in practice?",
    b: "I understand the theory - stack is LIFO and queue is FIFO. But I do not understand when I would actually reach for one in a real program.\n\nCould someone give a concrete example outside of the textbook recursion/print-job one?", tags: ["datastructures", "algorithms"] },
  { by: "beginner", t: "Why does my Python for-loop skip the last element of a list?",
    b: "```python\nitems = [1, 2, 3, 4]\nfor i in range(len(items) - 1):\n    print(items[i])\n```\n\nIt prints 1, 2, 3 and not 4. What is the correct way to write this?", tags: ["python", "basics"] },
  { by: "developer", t: "Implementing exponential backoff with jitter in a Node.js client",
    b: "I want retries with exponential backoff but the synchronised retries from many instances hammered my dependency during an incident.\n\n```javascript\nconst delay = base * Math.pow(2, attempt);\nawait sleep(delay);\n```\n\nHow should jitter be added so that clients desynchronise?", tags: ["nodejs", "javascript", "distributed-systems"] },
  { by: "developer", t: "Graceful shutdown in a Node.js service with in-flight requests",
    b: "On deploy the process receives SIGTERM and I immediately see 502s from the load balancer while requests are still running.\n\nWhat is the correct shutdown sequence - stop accepting, drain, then close - and how long should the drain timeout be?", tags: ["nodejs", "docker", "devops"] },
  { by: "developer", t: "Structured logging versus plain console.log in a Node service",
    b: "Our logs are human-readable but we cannot reliably query them. Moving to JSON logs would help, but the team is large and many call sites exist.\n\nIs there a low-friction way to introduce structured logging without rewriting every call site?", tags: ["nodejs", "observability", "logging"] },
  { by: "u4", t: "Deadlock detection between two threads holding mutexes in opposite order",
    b: "Two threads each acquire a different mutex before the other, which produces an intermittent deadlock under load.\n\nWhat is the cleanest fix - a consistent lock ordering convention, `try_lock` with timeout, or a single combined lock?", tags: ["operating-systems", "c", "concurrency"] },
  { by: "u4", t: "Understanding virtual memory and why a program can exceed available RAM",
    b: "A process with a 4GB heap runs fine on a machine with 2GB of free memory. I understand paging to disk, but how does the OS decide what to evict?\n\nWhat exactly is the page fault path when a page is not resident?", tags: ["operating-systems", "memory", "basics"] },
  { by: "u4", t: "Compiler optimisation removed a field I was reading - undefined behaviour or a bug?",
    b: "Reading an object field that the compiler has determined is never written is undefined behaviour in C. In practice my code works in debug and breaks in release.\n\nIs there a code pattern that expresses 'initialise this explicitly' that survives aggressive optimisation?", tags: ["compilers", "c", "undefined-behaviour"] },
  { by: "u3", t: "How does BGP route selection actually choose between two paths to the same prefix?",
    b: "I understand longest-prefix match, but when two paths have identical prefix length, the decision is opaque to me.\n\nWhat is the full tie-break order, and where does MED and local preference actually sit in it?", tags: ["computer-networks", "routing", "interview"] },
  { by: "u3", t: "TCP handshake versus QUIC handshake - where does the latency difference come from?",
    b: "Everyone says QUIC is faster because of the handshake. I would like to understand the actual packet-level difference rather than repeat the claim.\n\nCan someone walk through what happens in 1-RTT and 0-RTT?", tags: ["computer-networks", "http", "performance"] },
  { by: "u5", t: "MySQL index is used for the WHERE clause but the query is still slow",
    b: "The index is definitely used - the EXPLAIN shows `ref` rather than `ALL`. But the query still takes 800ms on a table with two million rows.\n\nWhat are the likely culprits and in what order should I investigate them?", tags: ["sql", "mysql", "performance"] },
  { by: "u5", t: "Should a foreign key column be indexed automatically in MySQL?",
    b: "`SHOW INDEX` on my child table shows an index on the foreign key column that I never created explicitly. Where did it come from, and can I rely on it?", tags: ["sql", "mysql", "databases"] },
  { by: "u1", t: "Testing React components that depend on a global fetch mock",
    b: "My component fetches on mount and my test needs to mock global fetch. The test passes alone but fails when run with the rest of the suite.\n\nWhat is the correct way to scope the mock so it does not leak between tests?", tags: ["react", "testing", "javascript"] },
  { by: "u1", t: "useEffect dependency array with an object literal",
    b: "My effect runs on every render even though I passed an empty dependency array in some components and a literal in others.\n\nThe literal is recreated every render. What is the idiomatic fix?", tags: ["react", "hooks", "javascript"] },
  { by: "u2", t: "Propagating a trace ID across services without a library",
    b: "I want a correlation ID that flows from the edge service through Kafka consumers into downstream HTTP calls.\n\nWithout OpenTelemetry, what is the minimal propagation approach that still gives useful traces?", tags: ["microservices", "observability", "distributed-systems"] },
  { by: "u2", t: "Backpressure in a Node.js stream pipeline",
    b: "A readable stream is piped into an HTTP request body. When the network is slow, memory usage climbs until the process is killed.\n\nIs `pipeline()` enough, or do I need explicit highWaterMark tuning?", tags: ["nodejs", "streams", "performance"] },
  { by: "u6", t: "Docker layer caching: why does my build re-download dependencies every time?",
    b: "My Dockerfile copies the whole project before running `npm ci`, so any source change invalidates the dependency layer.\n\nWhat is the correct ordering, and should I use npm ci or npm install in a container?", tags: ["docker", "devops", "ci"] },
  { by: "u6", t: "GitHub Actions matrix strategy for testing multiple Node versions",
    b: "I want to run the test suite on Node 18, 20 and 22. My current workflow only runs on one version.\n\nWhat does the correct matrix configuration look like, and how do I skip redundant cache uploads?", tags: ["github", "ci", "devops"] },
  { by: "u7", t: "FlatList renders blank items when scrolling fast on Android",
    b: "Images in a FlatList flash or disappear while scrolling on Android. iOS is fine.\n\nIs this a keyExtractor problem, an image-sizing problem, or something specific to how Android recycles views?", tags: ["react-native", "javascript", "mobile"] },
  { by: "u7", t: "Storing an auth token in React Native without exposing it",
    b: "AsyncStorage is not secure on a rooted device. What is the practical recommendation for storing a session token in a React Native app?", tags: ["react-native", "security", "mobile"] },
  { by: "recruiter", t: "What should a junior developer portfolio show for frontend roles?",
    b: "I review around 40 junior frontend portfolios a month. Completed tutorials and clone apps dominate, but they rarely demonstrate anything I cannot already infer.\n\nWhat actually moves a candidate forward at the screening stage?", tags: ["career", "webdevelopment", "hiring"] },
  { by: "recruiter", t: "How to read a GitHub profile in under five minutes",
    b: "Given sixty seconds of screen time, what tells in a candidate's GitHub are genuinely predictive of how they will perform on our team?", tags: ["github", "career", "hiring"] },
  { by: "moderator", t: "Writing technical posts that get engagement instead of being ignored",
    b: "I write about backend engineering. My posts get a handful of likes while generic career posts get hundreds.\n\nIs there a structural reason, and what can I change about how I write them?", tags: ["writing", "community", "career"] },
  { by: "moderator", t: "How to give useful code review feedback as a junior developer",
    b: "I have started reviewing pull requests. My feedback tends to be either pure style nitpicks or vague concerns.\n\nWhat makes feedback actually useful to the author?", tags: ["career", "git", "code-review"] },
];

// ---------------------------------------------------------------------------
const COMMUNITY_POSTS = [
  { by: "aiml", c: "Finally shipped a retrieval-augmented support assistant for our internal docs. #NLP #MachineLearning #AI", likes: 14, tags: ["nlp", "machinelearning", "ai"], code: "reranker = CrossEncoder('ms-marco-MiniLM-L-6-v2')", img: "https://picsum.photos/seed/aiml1/640/360" },
  { by: "developer", c: "Weekend project: a tiny event-driven order pipeline in Node.js with exactly-once-ish semantics via an outbox table. #JavaScript #NodeJS #GitHub", likes: 11, tags: ["javascript", "nodejs", "github"], code: "await db.collection('outbox').insertOne({ orderId, event: 'order.created' });" },
  { by: "datasci", c: "Three months of forecasting work distilled into one notebook. The naive seasonal baseline beat our transformer for six weeks. #DataScience #Python", likes: 18, tags: ["datascience", "python"], img: "https://picsum.photos/seed/ds1/640/360" },
  { by: "webdev", c: "Rebuilt our design-system dropdown to be fully keyboard accessible. Wrote up the ARIA pattern I used. #WebDevelopment #React #Accessibility", likes: 9, tags: ["webdevelopment", "react", "accessibility"], code: "<div role=\"listbox\" aria-activedescendant={activeId}>" },
  { by: "senior", c: "Hot take after ten years of platform work: most 'outages' are capacity surprises, not code surprises. We ship capacity forecasts like release notes now. #DistributedSystems #DevOps", likes: 22, tags: ["distributed-systems", "devops"] },
  { by: "gold", c: "Our Java service went from 4 minutes to 11 seconds to start. The fix was a single blocking initialisation bean that hid a 40MB resource load. #Java #SpringBoot #Performance", likes: 16, tags: ["java", "springboot", "performance"], code: "@Lazy\n@Bean\npublic RemoteClient remoteClient() { return new RemoteClient(url); }" },
  { by: "aiml", c: "GPU memory is not the bottleneck in most fine-tuning runs - your data pipeline is. Ours was 40x slower than the training step itself. #AI #MachineLearning #Python", likes: 20, tags: ["ai", "machinelearning", "python"] },
  { by: "beginner", c: "Finally understood recursion. Drew the call stack on paper until it clicked. Small wins. #Python #Learning", likes: 15, tags: ["python", "learning"] },
  { by: "silver", c: "Migrated a 90k-line codebase to the Next.js App Router over six weeks. Here is what surprised me. #NextJS #React #WebDevelopment", likes: 13, tags: ["nextjs", "react", "webdevelopment"], img: "https://picsum.photos/seed/next1/640/360" },
  { by: "u4", c: "Wrote a userspace cooperative scheduler in C for an OS course. Context switching with ucontext made threads finally make sense. #OperatingSystems #C #GitHub", likes: 17, tags: ["operatingsystems", "c", "github"], code: "ucontext_t ctx; swapcontext(&ctx, &sched_ctx);" },
  { by: "u3", c: "Built a packet sniffer from scratch in Python. Seeing the TCP three-way handshake on the wire finally made the textbook diagrams click. #ComputerNetworks #Python #Networking", likes: 19, tags: ["computernetworks", "python", "networking"], img: "https://picsum.photos/seed/net1/640/360" },
  { by: "developer", c: "Hackathon weekend: 36 hours, six people, a working on-prem Llama runner on a single GPU. #Hackathon #AI #GitHub", likes: 24, tags: ["hackathon", "ai", "github"] },
  { by: "webdev", c: "Certification unlocked: AWS Cloud Practitioner. Three months of evening study after a full day of work. #Certification #Cloud #Learning", likes: 10, tags: ["certification", "cloud", "learning"] },
  { by: "u2", c: "Our Kafka consumer group kept rebalancing every 30 seconds. It was a heartbeat misconfiguration, not a partition problem. #Kafka #DistributedSystems", likes: 12, tags: ["kafka", "distributed-systems"], code: "max.poll.interval.ms must exceed worst-case processing time" },
  { by: "silver", c: "Typed the entire API surface of our internal service and removed 600 lines of runtime validation. #TypeScript #JavaScript #Refactoring", likes: 8, tags: ["typescript", "javascript", "refactoring"] },
  { by: "gold", c: "Spring Boot + JPA N+1 query problem in production. One `join fetch` took a 4-second page to 90ms. #Java #SpringBoot #Performance", likes: 15, tags: ["java", "springboot", "performance"], code: "@EntityGraph(attributePaths = {\"items\"})\nList<Order> findByCustomerId(Long id);" },
  { by: "datasci", c: "Learned that 80% of my model errors were data quality issues, not modelling issues. #DataScience #Python #MachineLearning", likes: 21, tags: ["datascience", "python", "machinelearning"] },
  { by: "recruiter", c: "I review 40 junior portfolios a month. Here is the one-page README that gets an interview. #Career #Hiring #GitHub", likes: 26, tags: ["career", "hiring", "github"], img: "https://picsum.photos/seed/rec1/640/360" },
  { by: "moderator", c: "Reminder that asking a well-formed question is a skill worth practising, not a test you either pass or fail. #Community #Career", likes: 17, tags: ["community", "career"] },
  { by: "u5", c: "Rewrote a 12-second report query into three indexed queries that run in 80ms. #SQL #PostgreSQL #Performance", likes: 14, tags: ["sql", "postgresql", "performance"], code: "CREATE INDEX CONCURRENTLY idx_events_created_at ON events (created_at DESC);" },
  { by: "u6", c: "Cut our Docker image from 1.4GB to 180MB with multi-stage builds. #DevOps #Docker #CI", likes: 16, tags: ["devops", "docker", "ci"], code: "FROM node:22-slim AS deps\nFROM gcr.io/distroless/nodejs22 AS runtime" },
  { by: "aiml", c: "Prompt caching cut our inference bill by 60%. The prefix had to be byte-identical across calls. #AI #LLM #MachineLearning", likes: 23, tags: ["ai", "llm", "machinelearning"] },
  { by: "beginner", c: "Solved my first medium LeetCode problem today. Two hours of struggle for a three-line solution. #Learning #Algorithms", likes: 13, tags: ["learning", "algorithms"] },
  { by: "developer", c: "Project launch: a self-hosted read-later service with full-text search, built over a weekend. #GitHub #ProjectLaunch #NodeJS", likes: 18, tags: ["github", "projectlaunch", "nodejs"], img: "https://picsum.photos/seed/launch1/640/360" },
  { by: "senior", c: "The most useful code review I received this year was someone asking me what I was trying to achieve. #CodeReview #Career", likes: 25, tags: ["codereview", "career"] },
  { by: "webdev", c: "Container queries changed how I build components entirely. Our card now adapts to its slot, not the viewport. #CSS #WebDevelopment", likes: 11, tags: ["css", "webdevelopment"], code: ".card-host { container-type: inline-size; }" },
  { by: "u1", c: "Finally wrote unit tests for the component everyone said was untestable. It was not untestable. #React #Testing #JavaScript", likes: 9, tags: ["react", "testing", "javascript"] },
  { by: "gold", c: "Interview question I now ask every candidate: walk me through a bug you shipped to production and how you found it. #Career #Hiring", likes: 20, tags: ["career", "hiring"] },
  { by: "datasci", c: "Shipped a feature store that cut our feature engineering code by 70%. #DataScience #MachineLearning #MLOps", likes: 15, tags: ["datascience", "machinelearning", "mlops"] },
  { by: "silver", c: "Debugging story: a memory leak that only appeared after we scaled from 2 to 40 workers. It was a module-level cache. #NodeJS #Debugging #Performance", likes: 14, tags: ["nodejs", "debugging", "performance"], code: "const cache = new Map(); // never evicted - this was the leak" },
  { by: "moderator", c: "If your post gets a downvote, the feedback is almost never about the technology. #Community #Writing", likes: 17, tags: ["community", "writing"] },
  { by: "u3", c: "Learning Kubernetes by breaking it on purpose. Deleted a pod mid-request to see what actually happens. #DevOps #Kubernetes #Learning", likes: 12, tags: ["devops", "kubernetes", "learning"] },
  { by: "u7", c: "Shipped my first React Native app to the App Store. Offline-first sync was harder than the UI. #ReactNative #Mobile #ProjectLaunch", likes: 16, tags: ["react-native", "mobile", "projectlaunch"], img: "https://picsum.photos/seed/rn1/640/360" },
  { by: "u4", c: "Debugging tip: if your segmentation fault only happens with optimisation enabled, assume undefined behaviour before assuming a compiler bug. #C #Debugging #OperatingSystems", likes: 10, tags: ["c", "debugging", "operatingsystems"] },
  { by: "aiml", c: "Reading the transformer attention paper properly changed how I write model code. #AI #NLP #MachineLearning", likes: 22, tags: ["ai", "nlp", "machinelearning"] },
];

const ANSWER_PLAN = {
  0: ["silver", "senior"], 1: ["aiml", "developer"], 2: ["gold", "senior", "u5"], 3: ["senior", "u5"],
  4: ["senior", "developer"], 5: ["senior", "u2"], 6: ["developer", "u3"], 7: ["senior", "u2"],
  8: ["datasci", "aiml"], 9: ["datasci", "senior"], 10: ["u5", "senior"], 11: ["aiml", "senior"],
  12: ["aiml", "u4"], 13: ["silver", "u1"], 14: ["silver", "webdev"], 15: ["developer", "u2"],
  16: ["silver", "u1"], 17: ["webdev", "silver"], 18: ["webdev", "u1"], 19: ["bronze", "u5"],
  20: ["bronze", "senior"], 21: ["bronze", "u6"], 22: ["bronze", "beginner"], 23: ["beginner", "silver"],
  24: ["beginner", "u5"], 25: ["developer", "u2"], 26: ["developer", "senior"], 27: ["developer", "u6"],
  28: ["u4", "silver"], 29: ["u4", "u3"], 30: ["u4", "u3"], 31: ["u3", "u4"], 32: ["u3", "senior"],
  33: ["u5", "senior"], 34: ["u5", "u2"], 35: ["u1", "silver"], 36: ["u1", "webdev"],
  37: ["u2", "senior"], 38: ["u2", "developer"], 39: ["u6", "developer"], 40: ["u6", "senior"],
  41: ["u7", "webdev"], 42: ["u7", "u1"], 43: ["recruiter", "moderator"], 44: ["recruiter", "senior"],
  45: ["moderator", "silver"], 46: ["moderator", "webdev"],
};

const ANSWER_TEXTS = [
  "This is almost always a filter-ordering problem rather than a token problem. The header is being read, but the signature verification happens before the claims are parsed, so a mismatch in `kid` or `alg` fails first.",
  "Check that your decoder is using the right issuer and audience. A silently mismatched audience claim produces exactly this symptom and the error message rarely points at it.",
  "This is a classic. In Express 4, an async handler that throws does not forward the rejection to the error middleware unless you wrap it or use a router that catches it.",
  "The distinction that usually matters is whether the work is CPU-bound or IO-bound. Throughput, latency and the right primitive all follow from that one question.",
  "Measure before you optimise. In most cases the bottleneck is somewhere you would not guess, and a profiler run costs less time than the guess you were about to ship.",
  "Two options, and they are not mutually exclusive. I would start with the one that is reversible and measure whether it actually moves the metric before adding the second.",
  "Be careful with the ordering here. If you do A then B, you can deadlock; if you do B then A, you cannot. Consistency beats cleverness.",
  "The documented behaviour and the actual behaviour diverge here in a way that only shows up under concurrency. Writing a test that reproduces it takes some care.",
  "Start from the simplest model that could possibly work and only add complexity when the metrics justify it. Most sophisticated approaches lose to a strong baseline on tabular data.",
  "Feature stores help, but the highest-value change is an automated check that the online and offline implementations agree. That catches drift long before a feature store would.",
  "The window function runs after the join, so it sees the joined row set. Compute the aggregate in a subquery first, then join that single row back.",
  "Put the instruction after the context, state explicitly that answers must be grounded in the provided passages, and consider refusing rather than guessing. Retrieval quality is usually the real bottleneck.",
  "Normalise first, then use a multilingual checkpoint. Swapping the tokenizer without retraining will not help.",
  "Yes, the cleanup runs. What you are seeing is the mount/unmount/mount cycle executing twice in development, which is intentional. Verify by logging in the handler.",
  "Make it dynamic by calling the cookies or headers API, and confirm from the build output that the segment was prerendered rather than server rendered on each request.",
  "Listen for the abort signal on the request and destroy the upstream stream when it fires. Also handle the error event on the response object so the socket is released.",
  "Build the union with a mapped type over the event tuple, and let TypeScript distribute over it. The reducer then narrows naturally without manual overloads.",
  "Container queries have been baseline since early 2023. A `@supports (container-type: inline-size)` block is a clean progressive enhancement.",
  "Use `role=\"listbox\"` with `role=\"option\"` children, manage `aria-activedescendant`, and implement the arrow-key, Home, End, Enter and Escape keys. The visual part is the easy part.",
  "That flash is almost always the stylesheet arriving after first paint. Inline the critical CSS or let the framework hoist it, and preload the font you actually render with.",
  "The planner will correctly decide a sequential scan is cheaper when it expects to read a large fraction of the table. Check the estimated versus actual row counts first.",
  "Merge for shared branches, rebase only your own unpushed work. The confusion comes from rebasing a branch other people have already pulled.",
  "Return 202 with a status resource URL in the body, and make the polling endpoint return the state plus a `Retry-After`. That is the pattern clients handle best.",
  "A sorted array with binary search if the set is static, a balanced tree if it changes often, and an interval tree if the query is genuinely about ranges.",
  "An expression evaluator walks a stack. Anything with nested structure - parsers, expression evaluation, undo history - naturally stacks.",
  "Iterate the array directly, or use `entries()` when you need the index. `range(len(arr) - 1)` is the bug you already found.",
  "Add full jitter: pick a random value in `[0, delay]`. That decorrelates clients far more effectively than a fixed fraction of the backoff.",
  "Stop accepting new work, wait for in-flight requests to drain, then close. Give the drain a bounded timeout slightly below your orchestrator's kill grace period.",
  "A logger that accepts a context object and serialises to JSON gives you most of the benefit without touching every call site.",
  "A consistent global lock ordering, enforced by a helper that acquires by sorted key, removes the entire class of bug.",
  "The OS maintains a per-process page table; a missing page triggers a fault, the kernel finds the page on disk, reads it in, and resumes the instruction. The virtual address space is what allows the apparent size to exceed RAM.",
  "Initialise the structure explicitly with a designated initialiser or a constructor so the compiler can see the write and cannot elide it.",
  "The tie-break order runs longest prefix, then highest local preference, then shortest AS path, then origin, then MED, then eBGP over iBGP, then lowest IGP metric to the next hop, then oldest route, then lowest router ID, then lowest neighbour address.",
  "TCP needs one round trip plus one for the request. QUIC moves the transport crypto into the connection and can send data in the first flight, with 0-RTT resuming a previous session.",
  "Check whether the index is covering - if the optimiser has to fetch the row for columns not in the index, a full index scan of a wider index can beat your lookup.",
  "MySQL creates an index on a foreign key column automatically if one does not already exist, because the constraint needs it for referential actions like cascade delete.",
  "Scope the mock to the test file and restore it in `afterEach`, or use a library that scopes mocks automatically. A mock that leaks between files is the usual cause.",
  "Memoise the object with `useMemo`, or hoist the literal out of the component. Otherwise it is a new reference each render and the effect re-runs.",
  "Generate or accept a trace ID at the edge, put it in a standard header, and read it in every downstream client. That is enough correlation without a full tracing SDK.",
  "`pipeline()` propagates errors and destroys the streams, but you still need appropriate `highWaterMark` values for the slowest stage to get real backpressure.",
  "Copy only the manifests first, install, then copy the source. Use `npm ci` inside containers so the lockfile is authoritative.",
  "Use a build matrix with a `node-version` array, and key the cache on the lockfile hash rather than per-matrix-entry.",
  "Give every item a stable `keyExtractor`, and make sure the image has explicit dimensions so the recycled view knows the layout height.",
  "Use the platform keystore - iOS Keychain, Android EncryptedSharedPreferences via a library - and treat AsyncStorage as cache only.",
  "A short README with the problem, your approach, the trade-off you made and what you would do next. Depth over breadth, and a link to something you actually shipped.",
  "Whether the commit history is small and consistent, whether issues show they respond to other people, and whether anything outside the tutorial track exists.",
  "Lead with the outcome and the number, not the journey. Most technical posts are skipped because the value is not visible in the first two lines.",
  "Separate correctness from style. Comment on behaviour and intent, keep style to the linter, and say why a change matters rather than what it is.",
];

// ---------------------------------------------------------------------------
async function main() {
  await mongoose.connect(process.env.MONGODB_URL, { serverSelectionTimeoutMS: 30000 });
  console.log("connected to db:", mongoose.connection.db.databaseName);

  const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const renewal = new Date(Date.now() + 30 * 24 * 3600 * 1000);
  const users = new Map();
  const created = [];

  for (const u of [...ROSTER, ...THRESHOLDS]) {
    const existing = await User.findOne({ email: u.email });
    if (existing) {
      users.set(u.key, existing);
      continue;
    }
    const doc = await User.create({
      name: u.name,
      email: u.email,
      phone: u.phone || null,
      password: hash,
      about: u.about || "[DEMO SEED] Demonstration account.",
      tags: u.tags || [],
      role: u.role || "user",
      preferredLanguage: u.lang || "en",
      subscriptionPlan: u.plan || "free",
      subscriptionStatus: (u.plan && u.plan !== "free") ? "active" : "active",
      subscriptionRenewalDate: u.plan && u.plan !== "free" ? renewal : null,
      joinDate: new Date(Date.now() - (30 + Math.floor(Math.random() * 300)) * 86400000),
      // reputation is left at the schema default here on purpose: it is earned
      // through real API actions below, except for the threshold accounts.
      ...(u.rep !== undefined ? { reputation: u.rep } : {}),
    });
    users.set(u.key, doc);
    created.push(doc);
  }
  console.log(`users: ${created.length} created, ${ROSTER.length + THRESHOLDS.length - created.length} already present`);

  // Real sessions + trusted devices so the security screens have content.
  const tokens = new Map();
  const { getDeviceInfo } = await import("../services/deviceService.js");
  // Both the main roster AND the threshold accounts need a real session and a
  // real trusted device, otherwise a later HTTP login is (correctly) treated as
  // a new device and demands an OTP instead of returning a token.
  for (const u of [...ROSTER, ...THRESHOLDS]) {
    if (!users.has(u.key)) continue;
    const ua = u.ua || CHROME;
    const fakeReq = reqFor(ua, "203.0.113.10", u.city || "Unknown");
    const userDoc = users.get(u.key);
    const { session } = await (await import("../services/securityService.js")).createSession({
      userId: userDoc._id, req: fakeReq, isTrusted: true, isActive: true,
    });
    // The fingerprint is derived by the same code path the real login uses, so a
    // later HTTP login from the same User-Agent is recognised as a known device.
    const info = getDeviceInfo(fakeReq);
    await createTrustedDevice({ userId: userDoc._id, deviceInfo: info });
    tokens.set(u.key, jwt.sign({ id: userDoc._id.toString(), email: userDoc.email, sessionId: session._id.toString(), tokenId: session.tokenId }, process.env.JWT_SECRET, { expiresIn: "24h" }));
  }
  console.log("sessions: minted", tokens.size, "real sessions (+ trusted devices)");

  const T = (k) => tokens.get(k);

  // ---- profile completion (+10 each, via the real endpoint) ----
  let completed = 0;
  for (const u of ROSTER) {
    const r = await api(`/user/update/${users.get(u.key)._id}`, {
      method: "PATCH", token: T(u.key), ua: CHROME,
      body: { editForm: { name: u.name, about: u.about, tags: u.tags, phone: u.phone } },
    });
    if (r.status === 200) completed++;
  }
  console.log("profile completion calls:", completed);

  // ---- questions (real API -> +2 rep each, daily limits enforced) ----
  const questionIds = [];
  let qMade = 0, qSkipped = 0, qLimited = 0;
  for (const q of QUESTIONS) {
    const title = q.t;
    const { default: Question } = await import("../models/question.js");
    if (await Question.findOne({ questiontitle: title })) { qSkipped++; continue; }
    const r = await api("/question/ask", {
      method: "POST", token: T(q.by), ua: CHROME,
      body: { postquestiondata: { questiontitle: q.t, questionbody: q.b, questiontags: q.tags } },
    });
    if (r.status === 201) { questionIds.push({ id: r.body.data._id, by: q.by }); qMade++; }
    else { qLimited++; }
  }
  console.log(`questions: ${qMade} created, ${qSkipped} already present, ${qLimited} blocked by daily plan limit`);

  // ---- answers (real API -> +5 rep each) ----
  let aMade = 0, aSkipped = 0;
  const answerIndex = [];
  for (let i = 0; i < questionIds.length; i++) {
    const qi = questionIds[i];
    const { default: Question } = await import("../models/question.js");
    const doc = await Question.findById(qi.id);
    if ((doc?.answer?.length || 0) > 0) { aSkipped++; continue; }
    const authors = ANSWER_PLAN[i] || ["silver"];
    for (let k = 0; k < authors.length; k++) {
      const text = ANSWER_TEXTS[(i * 2 + k) % ANSWER_TEXTS.length];
      const r = await api(`/answer/postanswer/${qi.id}`, {
        method: "POST", token: T(authors[k]), ua: CHROME, body: { answerbody: text },
      });
      if (r.status === 201) { aMade++; answerIndex.push({ qid: qi.id, author: authors[k] }); }
    }
  }
  console.log(`answers: ${aMade} created, ${aSkipped} questions already answered`);

  // ---- accept an answer on a subset (+10 rep for the answerer) ----
  let accepted = 0;
  for (const qi of questionIds.slice(0, 14)) {
    const { default: Question } = await import("../models/question.js");
    const doc = await Question.findById(qi.id);
    const first = doc?.answer?.[0];
    if (!first) continue;
    const r = await api(`/question/${qi.id}/answers/${first._id}/accept`, { method: "PATCH", token: T(qi.by), ua: CHROME });
    if (r.status === 200) accepted++;
  }
  console.log("accepted answers:", accepted);

  // ---- votes: upvotes until the +5 (answer x5) and +2 (question x10) rules fire ----
  const voters = ["senior", "gold", "silver", "aiml", "datasci", "webdev", "developer", "u1", "u2", "u5", "u6", "u3"];
  let qUp = 0, aUp = 0, qDown = 0, aDown = 0;
  for (const qi of questionIds) {
    let i = 0;
    for (const v of voters) {
      if (v === qi.by) continue;
      const r = await api(`/question/vote/${qi.id}`, { method: "PATCH", token: T(v), ua: CHROME, body: { value: "upvote" } });
      if (r.status === 200) qUp++;
      if (++i >= 11) break;
    }
  }
  for (let n = 0; n < questionIds.length; n++) {
    const { default: Question } = await import("../models/question.js");
    const doc = await Question.findById(questionIds[n]._id || questionIds[n].id);
    const ans = doc?.answer || [];
    for (const a of ans) {
      for (const v of voters) {
        const authorKey = ROSTER.find((x) => x.name === a.useranswered)?.key;
        if (!authorKey || v === authorKey) continue;
        const r = await api(`/question/${questionIds[n].id}/answers/${a._id}/vote`, { method: "PATCH", token: T(v), ua: CHROME, body: { value: "upvote" } });
        if (r.status === 200) aUp++;
      }
    }
  }
  // a couple of genuine downvotes
  for (const qi of questionIds.slice(0, 3)) {
    const { default: Question } = await import("../models/question.js");
    const doc = await Question.findById(qi.id);
    const a = doc?.answer?.[0];
    const v = voters.find((x) => x !== qi.by);
    if (a) {
      const r = await api(`/question/${qi.id}/answers/${a._id}/vote`, { method: "PATCH", token: T(v), ua: CHROME, body: { value: "downvote" } });
      if (r.status === 200) aDown++;
    }
    const rq = await api(`/question/vote/${qi.id}`, { method: "PATCH", token: T(voters[1]), ua: CHROME, body: { value: "downvote" } });
    if (rq.status === 200) qDown++;
  }
  console.log(`votes: question upvotes=${qUp} question downvotes=${qDown} answer upvotes=${aUp} answer downvotes=${aDown}`);

  // ---- community posts, likes, comments, replies, bookmarks, follows, reports ----
  let posts = 0, likes = 0, comments = 0, replies = 0, shares = 0, bookmarks = 0, follows = 0, reports = 0;
  const postIds = [];
  for (const p of COMMUNITY_POSTS) {
    const { default: CommunityPost } = await import("../models/communityPost.js");
    if (await CommunityPost.findOne({ content: p.c })) continue;
    const r = await api("/community/posts", {
      method: "POST", token: T(p.by), ua: CHROME,
      body: { content: p.c, hashtags: p.tags, code: p.code || null, imageUrl: p.img || null },
    });
    if (r.status !== 201) continue;
    posts++; postIds.push(r.body.data._id);
  }
  console.log("community posts:", posts);

  const likers = ["senior", "gold", "silver", "aiml", "datasci", "webdev", "developer", "u1", "u2", "u4", "u5", "u6"];
  for (let i = 0; i < postIds.length; i++) {
    const target = COMMUNITY_POSTS[i];
    for (const l of likers.slice(0, target.likes)) {
      const r = await api(`/community/posts/${postIds[i]}/like`, { method: "POST", token: T(l), ua: CHROME });
      if (r.status === 200) likes++;
    }
    if (i % 3 === 0) {
      const rs = await api(`/community/posts/${postIds[i]}/share`, { method: "POST", token: T("developer"), ua: CHROME });
      if (rs.status === 200) shares++;
    }
    for (const c of ["senior", "silver", "u1"].slice(0, 1 + (i % 3))) {
      const rc = await api(`/community/posts/${postIds[i]}/comments`, { method: "POST", token: T(c), ua: CHROME, body: { text: "Really useful write-up, thanks for sharing the numbers." } });
      if (rc.status === 201) { comments++; }
    }
    const bc = await api(`/community/posts/${postIds[i]}/bookmark`, { method: "POST", token: T("recruiter"), ua: CHROME });
    if (bc.status === 200) bookmarks++;
  }
  // replies on the first few posts
  for (let i = 0; i < Math.min(8, postIds.length); i++) {
    const { default: CommunityPost } = await import("../models/communityPost.js");
    const doc = await CommunityPost.findById(postIds[i]);
    const cid = doc?.comments?.[0]?._id;
    if (!cid) continue;
    const rr = await api(`/community/posts/${postIds[i]}/comments/${cid}/replies`, { method: "POST", token: T("moderator"), ua: CHROME, body: { text: "Agreed - and the follow-up measurement is the part most write-ups skip." } });
    if (rr.status === 201) replies++;
  }
  console.log(`community engagement: likes=${likes} comments=${comments} replies=${replies} shares=${shares} bookmarks=${bookmarks}`);

  for (const f of ROSTER) {
    for (const g of ROSTER) {
      if (f.key === g.key) continue;
      if (f.key < g.key) {
        const r = await api(`/community/users/${users.get(g.key)._id}/follow`, { method: "POST", token: T(f.key), ua: CHROME });
        if (r.status === 200) follows++;
      }
    }
  }
  console.log("follows:", follows);

  for (let i = 0; i < Math.min(3, postIds.length); i++) {
    const r = await api(`/community/posts/${postIds[i]}/report`, { method: "POST", token: T("u7"), ua: CHROME, body: { reason: "Possible duplicate of an existing post - flagging for moderator review." } });
    if (r.status === 201) reports++;
  }
  console.log("reports:", reports);

  // question bookmarks
  let qb = 0;
  for (const qi of questionIds.slice(0, 8)) {
    const r = await api(`/question/bookmark/${qi.id}`, { method: "POST", token: T("silver"), ua: CHROME });
    if (r.status === 200) qb++;
  }
  console.log("question bookmarks:", qb);

  // ---- final tally ----
  const tallies = {};
  for (const m of ["users", "questions", "communityposts", "reputationlogs", "notifications", "follows", "bookmarks", "reports", "sessions", "loginactivities", "trusteddevices", "payments"]) {
    tallies[m] = await mongoose.connection.db.collection(m).countDocuments();
  }
  console.log("\n=== FINAL COLLECTION COUNTS ===");
  console.log(tallies);

  console.log("\n=== DEMO USER REPUTATION (earned via real API actions) ===");
  for (const u of ROSTER) {
    const fresh = await User.findById(users.get(u.key)._id).select("name reputation subscriptionPlan").lean();
    console.log(`  ${fresh.name.padEnd(30)} rep=${String(fresh.reputation).padStart(4)} plan=${fresh.subscriptionPlan}`);
  }

  await mongoose.disconnect();
}

main().catch((e) => { console.error("SEED FAILED:", e); process.exit(1); });
