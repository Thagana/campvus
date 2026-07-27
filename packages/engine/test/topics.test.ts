import test from 'node:test'
import assert from 'node:assert/strict'
import { topicForCourse, topicForCourseAndRegion } from '../src/topics'

test('topicForCourseAndRegion is deterministic for the same course + region', () => {
  const a = topicForCourseAndRegion('COMSCI214', 'res-north')
  const b = topicForCourseAndRegion('COMSCI214', 'res-north')
  assert.deepEqual(a, b)
})

test('topicForCourseAndRegion differs by region for the same course', () => {
  const north = topicForCourseAndRegion('COMSCI214', 'res-north')
  const south = topicForCourseAndRegion('COMSCI214', 'res-south')
  assert.notDeepEqual(north, south)
})

test('topicForCourseAndRegion differs from the plain course-wide topic', () => {
  const wide = topicForCourse('COMSCI214')
  const regional = topicForCourseAndRegion('COMSCI214', 'res-north')
  assert.notDeepEqual(wide, regional)
})
