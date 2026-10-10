import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  label?: string;
  compact?: boolean;
};
type State = { crashed: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { crashed: false };

  static getDerivedStateFromError(): State {
    return { crashed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.label || 'App'}] UI render error`, error, info.componentStack);
  }

  render() {
    if (!this.state.crashed) return this.props.children;

    return <div role="alert" className={this.props.compact ? 'ui-error-boundary compact' : 'ui-error-boundary'}>
      <strong>{this.props.compact ? `${this.props.label || 'This section'} is temporarily unavailable` : 'This screen had trouble loading'}</strong>
      <p>The rest of your plan is safe. Retry this section without reloading the whole page.</p>
      <button type="button" className="secondary" onClick={() => this.setState({ crashed: false })}>Try again</button>
    </div>;
  }
}
