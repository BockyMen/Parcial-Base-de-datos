const express = require("express");
const path = require("path");
const offeringRoutes = require("./routes/offering.routes");

const api = express();
const port = 5000;

api.use(express.json());
api.use(express.static("public"));
api.use("/main", offeringRoutes);

api.listen(port, () => {
  console.log('Server Running in http://localhost:5000');
});
