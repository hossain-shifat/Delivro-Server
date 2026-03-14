import express from "express";
import { authorize, protect } from "../middleware/auth.js";
import { getDashboardStats } from "../controllers/adminController.js";

const AdminRouter = express.Router();

// get dashboard stats
AdminRouter.get("/stats", protect, authorize("admin"), getDashboardStats);


export default AdminRouter
