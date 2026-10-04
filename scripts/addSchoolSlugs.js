import "dotenv/config";
import mongoose from "mongoose";
import School from "../models/School.js";

const generateSlug = (name) => {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
};

const run = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);

    console.log("Connected to MongoDB");

    const schools = await School.find({
      $or: [
        { slug: { $exists: false } },
        { slug: null },
        { slug: "" },
      ],
    });

    console.log(`Found ${schools.length} school(s) without slugs`);

    for (const school of schools) {
      const baseSlug = generateSlug(school.name);

      if (!baseSlug) {
        console.log(
          `Skipping "${school.name}" because a slug could not be generated`
        );
        continue;
      }

      let slug = baseSlug;
      let counter = 1;

      while (
        await School.exists({
          slug,
          _id: { $ne: school._id },
        })
      ) {
        counter += 1;
        slug = `${baseSlug}-${counter}`;
      }

      school.slug = slug;

      await school.save();

      console.log(`Updated: ${school.name} → ${slug}`);
    }

    console.log("School slug migration completed");

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("School slug migration failed:", error);

    await mongoose.disconnect();
    process.exit(1);
  }
};

run();