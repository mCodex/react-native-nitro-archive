package com.mcodex.nitroarchive.domain

enum class TaskState {
    IDLE, RUNNING, CANCELLING, SUCCEEDED, FAILED, CANCELLED;

    val isTerminal: Boolean
        get() = this == SUCCEEDED || this == FAILED || this == CANCELLED
}

class TaskStateMachine {
    private var _state: TaskState = TaskState.IDLE
    private val lock = Any()

    val state: TaskState
        get() = synchronized(lock) { _state }

    fun start() {
        synchronized(lock) {
            check(_state == TaskState.IDLE) { "Task is not idle (state=${_state.name})" }
            _state = TaskState.RUNNING
        }
    }

    fun cancel(): Boolean {
        synchronized(lock) {
            return when (_state) {
                TaskState.IDLE -> {
                    _state = TaskState.CANCELLED
                    true
                }
                TaskState.RUNNING -> {
                    _state = TaskState.CANCELLING
                    true
                }
                else -> false
            }
        }
    }

    fun succeed() {
        synchronized(lock) {
            require(_state == TaskState.RUNNING || _state == TaskState.CANCELLING) {
                "Task cannot succeed from state=${_state.name}"
            }
            _state = TaskState.SUCCEEDED
        }
    }

    fun fail() {
        synchronized(lock) {
            _state = TaskState.FAILED
        }
    }

    fun markCancelled() {
        synchronized(lock) {
            require(_state == TaskState.CANCELLING) {
                "Task cannot be cancelled from state=${_state.name}"
            }
            _state = TaskState.CANCELLED
        }
    }
}
