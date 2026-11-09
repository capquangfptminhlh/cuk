/** Order state machine. Completed and cancelled orders must not be reopened. */
const transitions = Object.freeze({
  new: ['confirmed', 'shipping', 'cancelled'],
  confirmed: ['shipping', 'completed', 'cancelled'],
  shipping: ['completed', 'cancelled'],
  completed: [],
  cancelled: []
})
export function canTransitionOrder(from, to) {
  return from === to || (transitions[from] || []).includes(to)
}
