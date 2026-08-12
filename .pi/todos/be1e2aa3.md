{
  "id": "be1e2aa3",
  "title": "阶段A: antd 6 升级",
  "tags": [],
  "status": "completed",
  "created_at": "2026-08-12T15:17:32.196Z",
  "assigned_to_session": "019ff651-79a1-7dea-8c19-2fcc913bafb7"
}

1. bun add antd@6 @ant-design/icons@6
2. 移除 @ant-design/v5-patch-for-react-19
3. 修 Policies.tsx Space direction → orientation
4. antd lint --version 6 清零
5. bun run verify + E2E 全绿
