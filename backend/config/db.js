import mongoose from "mongoose";
import dns from "node:dns";

const DNS_RETRY_SERVERS = ["8.8.8.8", "1.1.1.1"];
const connectOptions = { serverSelectionTimeoutMS: 10000 };

mongoose.set("bufferCommands", false);

const isSrvDnsError = (mongoUri, error) => {
  if (!mongoUri?.startsWith("mongodb+srv://")) return false;

  const message = String(error?.message || "");
  const code = String(error?.code || "");

  return /querySrv|queryTxt|ENOTFOUND|ETIMEOUT|ECONNREFUSED|ESERVFAIL|ENODATA/i.test(
    `${code} ${message}`
  );
};

export const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI;
  const directMongoUri = process.env.MONGO_URI_DIRECT || process.env.MONGODB_DIRECT_URI;

  if (!mongoUri) {
    throw new Error("MONGO_URI is missing in backend/.env");
  }

  if (mongoUri.startsWith("mongodb+srv://")) {
    dns.setServers(DNS_RETRY_SERVERS);
  }

  try {
    await mongoose.connect(mongoUri, connectOptions);
    console.log("DB Connected");
    return true;
  } catch (error) {
    if (isSrvDnsError(mongoUri, error)) {
      try {
        await mongoose.connect(mongoUri, connectOptions);
        console.log("DB Connected");
        return true;
      } catch (retryError) {
        if (directMongoUri) {
          console.warn("MongoDB SRV lookup failed. Trying direct MongoDB URI fallback...");
          await mongoose.connect(directMongoUri, connectOptions);
          console.log("DB Connected with direct MongoDB URI");
          return true;
        }

        throw new Error(
          "MongoDB SRV lookup failed after DNS retry. Add Atlas non-SRV mongodb:// URI as MONGO_URI_DIRECT in backend/.env, or replace MONGO_URI with the non-SRV URI from Atlas."
        );
      }
    }

    throw new Error(`DB Error: ${error.message}`);
  }
};
