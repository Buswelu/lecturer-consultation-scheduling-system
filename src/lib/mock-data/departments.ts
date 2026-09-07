import type { Department } from "@/lib/types";

export const departments: Department[] = [
  {
    id: "dept-cs",
    name: "Computer Science",
    code: "CS",
    description: "Studies of computation, information, and automation.",
    status: "active",
    createdAt: "2024-01-10T09:00:00Z",
  },
  {
    id: "dept-math",
    name: "Mathematics",
    code: "MATH",
    description: "The study of numbers, quantity, and space.",
    status: "active",
    createdAt: "2024-01-10T09:00:00Z",
  },
  {
    id: "dept-eng",
    name: "Engineering",
    code: "ENG",
    description: "Application of science and math to solve problems.",
    status: "active",
    createdAt: "2024-01-12T09:00:00Z",
  },
  {
    id: "dept-bus",
    name: "Business Administration",
    code: "BUS",
    description: "Management of businesses and organizations.",
    status: "active",
    createdAt: "2024-01-15T09:00:00Z",
  },
  {
    id: "dept-design",
    name: "Design & Media",
    code: "DES",
    description: "Creative and digital media studies.",
    status: "active",
    createdAt: "2024-02-01T09:00:00Z",
  },
  {
    id: "dept-econ",
    name: "Economics",
    code: "ECON",
    description: "The study of production, distribution, and consumption.",
    status: "inactive",
    createdAt: "2024-02-05T09:00:00Z",
  },
];
