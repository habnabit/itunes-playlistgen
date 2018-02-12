import React from 'react'
import CSSTransitionGroup from 'react-transition-group/CSSTransitionGroup'

class Alert extends React.Component {
  componentWillMount() {
    this.timeout = setTimeout(this.dismiss, 5000)
  }

  componentWillUnmount() {
    clearTimeout(this.timeout)
  }

  dismiss = _event => {
    this.props.dismiss()
  }

  render() {
    return <div className={`alert alert-${this.props.alert.type}`} onClick={this.dismiss}>
      {this.props.alert.message}
    </div>
  }
}

export function withAlerts(Wrapped) {
  return class WithAlerts extends React.Component {
    constructor(props) {
      super(props)
      this.state = {
        alerts: [],
        counter: 0,
      }
    }

    addAlert = (message, type) => {
      let alert = {
        message: message,
        type: type,
        key: this.state.counter,
      }
      let alerts = this.state.alerts.concat([alert])
      this.setState({alerts: alerts, counter: alert.key + 1})
    }

    removeAlert(key) {
      let alerts = this.state.alerts.filter(function (alert) {
        return alert.key !== key;
      })
      this.setState({alerts: alerts})
    }

    render() {
      let alerts = <div className="alerts">
        <CSSTransitionGroup transitionName="alert"
                            transitionEnterTimeout={300}
                            transitionLeaveTimeout={300}>
          {this.state.alerts.map(alert => (
            <Alert alert={alert} key={alert.key} dismiss={() => this.removeAlert(alert.key)} />
          ))}
        </CSSTransitionGroup>
      </div>
      return <Wrapped addAlert={this.addAlert} alerts={alerts} {...this.props} />
    }
  }
}
