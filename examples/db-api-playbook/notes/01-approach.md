# Choose the approach

Three questions, in this order.

1. **Who calls it?** Your own frontend, partners or the public, or internal services. Public APIs need a stable contract, docs and versioning from day one.
2. **Which style?**
   - **REST + OpenAPI**: the default for resource-oriented CRUD and public APIs; HTTP caching works out of the box.
   - **GraphQL**: many client shapes or aggregation over several sources in one round trip (spec: September 2025 edition).
   - **gRPC**: internal service-to-service calls with Protobuf contracts and streaming.
3. **Generated or hand-written?**
   - **Generated over Postgres** (PostgREST, Supabase Data API, Hasura DDN): CRUD-heavy apps where the access rules fit in roles, grants and row-level security. Little code, but the schema *is* the API.
   - **Hand-written service**: domain logic, workflows, calls to third parties, or a contract that must not follow the table layout.

Sources: [GraphQL September 2025](https://graphql.org/blog/2025-09-08-september-edition/) · [gRPC](https://grpc.io/docs/what-is-grpc/introduction/) · [PostgREST](https://docs.postgrest.org/) · [Supabase Data API](https://supabase.com/docs/guides/api) · [Hasura DDN](https://hasura.io/docs/3.0/index/)
