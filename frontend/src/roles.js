// Who can open which page. Mirrors backend/app/auth.py ROLES (the server enforces the API side).
import { Landmark, GraduationCap, Factory, BookOpen } from "lucide-react";

export const ROLES = {
  government: {
    label: "Government", sub: "Policy makers, skill missions, district officials", icon: Landmark, home: "map",
    pages: ["map", "gap", "demand", "training", "priority", "simulator", "career", "assistant", "method"],
    can: "Full access: gap analysis, recommendations, budget optimiser and what-if simulator",
  },
  college: {
    label: "College / Training provider", sub: "Colleges, ITIs, polytechnics, training partners", icon: GraduationCap, home: "gap",
    pages: ["map", "gap", "demand", "training", "simulator", "career", "assistant", "method"],
    can: "Skill gaps, demand forecasts, training coverage and course simulations",
  },
  industry: {
    label: "Industry / Employer", sub: "Companies, HR teams, industry bodies", icon: Factory, home: "demand",
    pages: ["map", "gap", "demand", "training", "assistant", "method"],
    can: "Where talent is short, hiring trends and where people are being trained",
  },
  student: {
    label: "Student / Job seeker", sub: "Students, ITI trainees, job seekers", icon: BookOpen, home: "career",
    pages: ["map", "demand", "career", "assistant", "method"],
    can: "Career matches, learning paths, pay and where the jobs are",
  },
};
export const SELF_SERVICE = ["student", "college", "industry"];   // Government needs an invite code
export const DEMO_PASSWORD = "Demo@123";
export const DEMO_USERS = [
  { name: "Government Officer (demo)", email: "govt@skillnet.in", role: "government" },
  { name: "College Admin (demo)", email: "college@skillnet.in", role: "college" },
  { name: "Industry HR (demo)", email: "industry@skillnet.in", role: "industry" },
  { name: "Student (demo)", email: "student@skillnet.in", role: "student" },
];
export const canOpen = (user, page) => !!user && ROLES[user.role]?.pages.includes(page);
