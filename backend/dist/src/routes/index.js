import { Router } from "express";
import adminRoutes from "./admin";
import authRoutes from "./auth";
import studentRoutes from "./student";
import testRoutes from "./test";
const router = Router();
router.get("/", (req, res) => {
    res.json({ message: "Student Portal API" });
});
router.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});
router.use("/api", authRoutes);
router.use("/api/student", studentRoutes);
router.use("/api/admin", adminRoutes);
router.use("/api", testRoutes);
export default router;
//# sourceMappingURL=index.js.map