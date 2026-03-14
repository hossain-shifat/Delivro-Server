import express from "express";
import { protect } from "../middleware/auth.js";
import {
    addAddresses,
    deleteAddress,
    getAddresses,
    updateAddress,
} from "../controllers/addressController.js";

const AddressRouter = express.Router();

// get addresses
AddressRouter.get("/", protect, getAddresses);

// Create Addresses
AddressRouter.post("/", protect, addAddresses);

// Update address
AddressRouter.put("/:id", protect, updateAddress);

// Delete address
AddressRouter.put("/:id", protect, deleteAddress);

export default AddressRouter;
