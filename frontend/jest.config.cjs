module.exports = {
 preset: 'ts-jest',
 testEnvironment: 'jsdom',
 roots: ['<rootDir>/src'],
 setupFilesAfterEnv: ['<rootDir>/src/test/setup.ts'],
 testMatch: ['**/*.test.ts', '**/*.test.tsx'],
 transform: {'^.+\\.tsx?$': ['ts-jest', {tsconfig: {jsx: 'react-jsx', module: 'CommonJS', esModuleInterop: true}}]},
 collectCoverageFrom: ['src/utils.ts', 'src/components/Common.tsx', 'src/store/index.ts', 'src/i18n.ts'],
 coverageReporters: ['text', 'lcov', 'json-summary'],
 coverageThreshold: {global: {statements: 80, lines: 80}}
};
