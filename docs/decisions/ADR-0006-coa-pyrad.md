# ADR-0006 · CoA/Disconnect 实现选用 pyrad

- 状态:已接受(2026-08-06)

## 背景

强制下线需向 NAS 发送 RFC 5176 Disconnect-Request(UDP 3799,NAS 共享密钥签名)。

## 备选

1. **pyrad(纯 Python)**:已确认支持 DisconnectPacket/CoAPacket(2.5.4),无外部二进制,
   可单测、可做 coa_sink 模拟器。
2. shell 调用 radclient:依赖容器内二进制与进程管理,错误解析脆弱。
3. 自研报文构造:重复造轮子且易错(认证器/属性编码)。

## 决定

pyrad,封装于 `backend/src/openredius/radius/coa.py`;同步 IO 经 anyio 线程池;
超时/重试/结果映射见 04。dev 集成测试配 `coa_sink.py` 模拟 NAS。

## 后果

- 正面:协议实现可靠;测试闭环不依赖真实设备。
- 代价:pyrad 维护活跃度一般(最近推送 2026-07,可用);若弃维可平滑切回 radclient 封装。
