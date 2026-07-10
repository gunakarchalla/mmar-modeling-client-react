// Loaded before any test module. The gds DTOs use class-transformer decorators
// (@Type) which call Reflect.* — mirror main.tsx by importing reflect-metadata first.
import "reflect-metadata";
