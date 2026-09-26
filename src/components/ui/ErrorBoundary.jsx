import { Component } from 'react';

/** Keeps a rendering failure in the results area from unmounting the whole app (inputs stay intact). */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div role="alert" className="rounded-md border border-bad/40 bg-bad-soft px-3 py-2 text-sm text-ink">
          <strong>The results could not be displayed:</strong> {String(this.state.error?.message ?? this.state.error)}.
          Your inputs are intact — adjust them, or reset to defaults.{' '}
          <button type="button" className="underline" onClick={() => this.setState({ error: null })}>Try again</button>
        </div>
      );
    }
    return this.props.children;
  }
}
