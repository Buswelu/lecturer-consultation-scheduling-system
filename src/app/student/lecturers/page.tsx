"use client";

import * as React from "react";
import { useMemo } from "react";
import { PageHeader } from "@/components/page-header";
import { SearchBar } from "@/components/search-bar";
import { FilterPanel, FilterField } from "@/components/filter-panel";
import { LecturerCard } from "@/components/lecturers/lecturer-card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LoadingState } from "@/components/loading-state";
import { EmptyState } from "@/components/empty-state";
import { getLecturers } from "@/lib/services/lecturers";
import { getDepartments, getCourses } from "@/lib/services/users";
import { availabilityRules } from "@/lib/mock-data";
import type { LecturerProfile, Department, Course } from "@/lib/types";

type AvailabilityFilter = "all" | "available" | "unavailable";
type SortOption = "name" | "department";

export default function LecturerSearchPage() {
  const [search, setSearch] = React.useState("");
  const [departmentId, setDepartmentId] = React.useState("all");
  const [courseId, setCourseId] = React.useState("all");
  const [availability, setAvailability] = React.useState<AvailabilityFilter>("all");
  const [sort, setSort] = React.useState<SortOption>("name");
  const [loading, setLoading] = React.useState(true);
  const [lecturers, setLecturers] = React.useState<LecturerProfile[]>([]);
  const [departments, setDepartments] = React.useState<Department[]>([]);
  const [courses, setCourses] = React.useState<Course[]>([]);

  React.useEffect(() => {
    const load = async () => {
      const [lec, deps, crs] = await Promise.all([
        getLecturers(),
        getDepartments(),
        getCourses(),
      ]);
      setLecturers(lec);
      setDepartments(deps);
      setCourses(crs);
      setLoading(false);
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    let result = lecturers;

    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (l) =>
          l.fullName.toLowerCase().includes(q) ||
          (l.bio ?? "").toLowerCase().includes(q),
      );
    }
    if (departmentId !== "all") {
      result = result.filter((l) => l.departmentId === departmentId);
    }
    if (courseId !== "all") {
      result = result.filter((l) => l.courses.includes(courseId));
    }
    if (availability === "available") {
      const lecturerIdsWithAvailability = new Set(
        availabilityRules.map((r) => r.lecturerId),
      );
      result = result.filter((l) => lecturerIdsWithAvailability.has(l.id));
    }

    const sorted = [...result].sort((a, b) => {
      if (sort === "name") return a.fullName.localeCompare(b.fullName);
      const aDept = departments.find((d) => d.id === a.departmentId)?.name ?? "";
      const bDept = departments.find((d) => d.id === b.departmentId)?.name ?? "";
      return aDept.localeCompare(bDept);
    });

    return sorted;
  }, [lecturers, search, departmentId, courseId, availability, sort, departments]);

  const handleReset = () => {
    setSearch("");
    setDepartmentId("all");
    setCourseId("all");
    setAvailability("all");
    setSort("name");
  };

  return (
    <div>
      <PageHeader
        title="Find a Lecturer"
        description="Search and filter lecturers to find the right consultation."
      />

      <FilterPanel onReset={handleReset}>
        <FilterField label="Search" className="min-w-[200px] flex-1">
          <SearchBar
            placeholder="Search by name..."
            value={search}
            onChange={setSearch}
          />
        </FilterField>
        <FilterField label="Department">
          <Select value={departmentId} onValueChange={setDepartmentId}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="All departments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {departments.filter((d) => d.status === "active").map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Course">
          <Select value={courseId} onValueChange={setCourseId}>
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue placeholder="All courses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All courses</SelectItem>
              {courses.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Availability">
          <Select
            value={availability}
            onValueChange={(v) => setAvailability(v as AvailabilityFilter)}
          >
            <SelectTrigger className="w-full sm:w-36">
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any</SelectItem>
              <SelectItem value="available">Available</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
        <FilterField label="Sort by">
          <Select value={sort} onValueChange={(v) => setSort(v as SortOption)}>
            <SelectTrigger className="w-full sm:w-36">
              <SelectValue placeholder="Sort" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Name</SelectItem>
              <SelectItem value="department">Department</SelectItem>
            </SelectContent>
          </Select>
        </FilterField>
      </FilterPanel>

      {loading ? (
        <LoadingState rows={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No lecturers found"
          description="Try adjusting your search filters."
          action={
            <button onClick={handleReset} className="text-sm font-medium text-primary hover:underline">
              Clear filters
            </button>
          }
        />
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((lecturer) => (
            <LecturerCard key={lecturer.id} lecturer={lecturer} />
          ))}
        </div>
      )}
    </div>
  );
}
